import { Sandbox } from "@vercel/sandbox";
import type { SandboxInfo } from "@/types/sandbox";
import type { DisplayClient, WorkspaceExperience } from "@/types/workspace";
import { SANDBOX_PORTS, PORTS } from "./ports";
import { getServiceCode } from "./sandbox-services";
import {
  getCliDisplayStartScript,
  getDisplayStartScript,
  getEcosystemConfig,
  getKasmVncStartScript,
  getNoVncStartScript,
  getRdpStartScript,
  getVncStartScript,
  getWebRtcStartScript,
  getXpraStartScript,
  getSandboxBridgeScript,
  SERVICE_DIR,
  XPRA_DISPLAY,
  DBUS_SOCKET_PATH,
} from "./ecosystem-config";
import { getDisplayHealthPath } from "@/lib/display-clients";

const DEFAULT_TIMEOUT = 45 * 60 * 1000; // 45 minutes (Vercel max: 2700000ms)
const READINESS_TIMEOUT_MS = 30_000;
const READINESS_POLL_MS = 1_000;

// sandbox.domain() returns "https://subdomain.vercel.run"
// We strip the protocol so consumers can choose https:// or wss://
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function buildSandboxInfo(sandbox: Sandbox): SandboxInfo {
  const displayDomain = stripProtocol(sandbox.domain(PORTS.DISPLAY));
  return {
    sandboxId: sandbox.sandboxId,
    status: sandbox.status,
    domains: {
      display: displayDomain,
      services: stripProtocol(sandbox.domain(PORTS.SERVICES)),
      codeServer: stripProtocol(sandbox.domain(PORTS.CODE_SERVER)),
      preview: stripProtocol(sandbox.domain(PORTS.PREVIEW)),
    },
    timeout: sandbox.timeout,
    createdAt: sandbox.createdAt.toISOString(),
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSandboxReadiness(
  sandbox: Sandbox,
  displayClient: DisplayClient,
  experience: WorkspaceExperience,
): Promise<void> {
  const servicesUrl = `${sandbox.domain(PORTS.SERVICES)}/health`;
  const displayUrl =
    experience === "cli"
      ? `${sandbox.domain(PORTS.DISPLAY)}/`
      : `${sandbox.domain(PORTS.DISPLAY)}${getDisplayHealthPath(displayClient)}`;
  const deadline = Date.now() + READINESS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const [servicesRes, displayRes] = await Promise.all([
        fetchWithTimeout(servicesUrl, 2_000),
        fetchWithTimeout(displayUrl, 2_000),
      ]);

      if (servicesRes.ok && displayRes.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, READINESS_POLL_MS));
  }

  console.warn(
    `[sandbox] Readiness timed out for ${sandbox.sandboxId} after ${READINESS_TIMEOUT_MS}ms`,
  );
}

export interface CreateSandboxResult extends SandboxInfo {
  fallback?: boolean;
}

type SandboxResources = {
  vcpus: number;
  memoryGb: number;
};

export async function createSandbox(
  snapshotId?: string,
  resources?: SandboxResources,
  displayClient: DisplayClient = "xpra",
  experience: WorkspaceExperience = "gui",
): Promise<CreateSandboxResult> {
  let sandbox: Sandbox;
  let usedSnapshot = false;
  const sandboxResources = resources ? { vcpus: resources.vcpus } : undefined;

  if (snapshotId) {
    try {
      sandbox = await Sandbox.create({
        source: { type: "snapshot", snapshotId },
        ports: SANDBOX_PORTS,
        timeout: DEFAULT_TIMEOUT,
        resources: sandboxResources,
      });
      usedSnapshot = true;
    } catch (err: unknown) {
      const errorText =
        typeof (err as { text?: unknown })?.text === "string"
          ? ((err as { text: string }).text || "")
          : "";
      const errorMessage = err instanceof Error ? err.message : "";
      const isNotFound =
        errorMessage.includes("404") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("Not Found") ||
        errorText.includes("not_found") ||
        errorText.toLowerCase().includes("snapshot expired or deleted");

      if (isNotFound) {
        console.warn(
          `[sandbox] Snapshot ${snapshotId} not found (expired?), falling back to fresh sandbox`,
        );
        sandbox = await Sandbox.create({
          runtime: "node24",
          ports: SANDBOX_PORTS,
          timeout: DEFAULT_TIMEOUT,
          resources: sandboxResources,
        });
      } else {
        throw err;
      }
    }
  } else {
    sandbox = await Sandbox.create({
      runtime: "node24",
      ports: SANDBOX_PORTS,
      timeout: DEFAULT_TIMEOUT,
      resources: sandboxResources,
    });
  }

  if (usedSnapshot) {
    await startServices(sandbox, displayClient, experience);
  } else {
    await bootstrapSandbox(sandbox, displayClient, experience);
  }

  await waitForSandboxReadiness(sandbox, displayClient, experience);

  return { ...buildSandboxInfo(sandbox), fallback: snapshotId ? !usedSnapshot : undefined };
}

async function startServices(
  sandbox: Sandbox,
  displayClient: DisplayClient,
  experience: WorkspaceExperience,
): Promise<void> {
  // Ensure DISPLAY and DBUS_SESSION_BUS_ADDRESS are set for all login shells.
  // Also baked into golden snapshot, but written at runtime for fresh sandboxes.
  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      `sudo mkdir -p /etc/profile.d && sudo tee /etc/profile.d/sandbox-display.sh > /dev/null << 'EOF'
export DISPLAY=${XPRA_DISPLAY}
export DBUS_SESSION_BUS_ADDRESS=unix:path=${DBUS_SOCKET_PATH}
export GIO_USE_SYSTEMD=0
EOF`,
    ],
  });

  // pm2 starts all services from the ecosystem config
  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      `DISPLAY_CLIENT=${displayClient} WORKSPACE_EXPERIENCE=${experience} pm2 start ${SERVICE_DIR}/ecosystem.config.js`,
    ],
    detached: true,
  });
}

async function bootstrapSandbox(
  sandbox: Sandbox,
  displayClient: DisplayClient,
  experience: WorkspaceExperience,
): Promise<void> {
  // Fresh VM without golden snapshot -- write everything and install deps
  await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", `sudo mkdir -p ${SERVICE_DIR} && sudo chown $(whoami) ${SERVICE_DIR}`],
  });
  await sandbox.writeFiles([
    { path: `${SERVICE_DIR}/service.js`, content: Buffer.from(getServiceCode()) },
    { path: `${SERVICE_DIR}/package.json`, content: Buffer.from('{"name":"vdex-services","private":true}') },
    { path: `${SERVICE_DIR}/ecosystem.config.js`, content: Buffer.from(getEcosystemConfig()) },
    { path: `${SERVICE_DIR}/display-start.sh`, content: Buffer.from(getDisplayStartScript()) },
    { path: `${SERVICE_DIR}/cli-display-start.sh`, content: Buffer.from(getCliDisplayStartScript()) },
    { path: `${SERVICE_DIR}/xpra-start.sh`, content: Buffer.from(getXpraStartScript()) },
    { path: `${SERVICE_DIR}/novnc-start.sh`, content: Buffer.from(getNoVncStartScript()) },
    { path: `${SERVICE_DIR}/vnc-start.sh`, content: Buffer.from(getVncStartScript()) },
    { path: `${SERVICE_DIR}/kasmvnc-start.sh`, content: Buffer.from(getKasmVncStartScript()) },
    { path: `${SERVICE_DIR}/rdp-start.sh`, content: Buffer.from(getRdpStartScript()) },
    { path: `${SERVICE_DIR}/webrtc-start.sh`, content: Buffer.from(getWebRtcStartScript()) },
    { path: `${SERVICE_DIR}/sandbox-bridge.py`, content: Buffer.from(getSandboxBridgeScript()) },
  ]);

  // Install service deps + pm2
  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      `cd ${SERVICE_DIR} && npm install ws && npm install -g pm2 && chmod +x ${SERVICE_DIR}/display-start.sh ${SERVICE_DIR}/cli-display-start.sh ${SERVICE_DIR}/xpra-start.sh ${SERVICE_DIR}/novnc-start.sh ${SERVICE_DIR}/vnc-start.sh ${SERVICE_DIR}/kasmvnc-start.sh ${SERVICE_DIR}/rdp-start.sh ${SERVICE_DIR}/webrtc-start.sh ${SERVICE_DIR}/sandbox-bridge.py`,
    ],
  });

  await startServices(sandbox, displayClient, experience);
}

export async function getSandbox(sandboxId: string): Promise<SandboxInfo> {
  const sandbox = await Sandbox.get({ sandboxId });
  return buildSandboxInfo(sandbox);
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
}

export async function snapshotSandbox(sandboxId: string): Promise<string> {
  const sandbox = await Sandbox.get({ sandboxId });
  const snapshot = await sandbox.snapshot();
  return snapshot.snapshotId;
}

export async function extendSandboxTimeout(
  sandboxId: string,
  durationMs: number,
): Promise<void> {
  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.extendTimeout(durationMs);
}

export async function listSandboxes() {
  const { json } = await Sandbox.list();
  return json.sandboxes;
}
