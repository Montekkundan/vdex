import {
  createSandbox,
  extendSandboxTimeout,
  getSandbox,
  listSandboxes,
  snapshotSandbox,
  stopSandbox,
} from "@/lib/sandbox/client";
import type { ProviderDriver } from "@/lib/runtime/providers/types";

export const vercelProviderDriver: ProviderDriver = {
  id: "vercel",
  async createWorkspaceRuntime({
    snapshotId,
    resources,
    displayClient,
    experience,
    timeoutMs,
  }) {
    return createSandbox(snapshotId, resources, displayClient, experience, timeoutMs);
  },
  async getRuntime(sandboxId) {
    return getSandbox(sandboxId);
  },
  async stopRuntime(sandboxId) {
    await stopSandbox(sandboxId);
  },
  async snapshotRuntime(sandboxId) {
    return snapshotSandbox(sandboxId);
  },
  async extendRuntime(sandboxId, durationMs) {
    await extendSandboxTimeout(sandboxId, durationMs);
  },
  async listRuntimes() {
    return listSandboxes();
  },
};
