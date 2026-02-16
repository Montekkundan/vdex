import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDisplayIframeUrl } from "@/lib/display-clients";
import { SharedTerminalViewer } from "@/components/share/SharedTerminalViewer";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getSandbox } from "@/lib/sandbox/client";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";
import type { DisplayClient } from "@/types/workspace";

function isIframeDisplayClient(
  client: string,
): client is Exclude<DisplayClient, "xpra" | "none"> {
  return (
    client === "novnc" ||
    client === "vnc" ||
    client === "rdp" ||
    client === "kasmvnc" ||
    client === "webrtc"
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      shareEnabled: workspaces.shareEnabled,
      shareId: workspaces.shareId,
      sandboxId: workspaces.sandboxId,
      status: workspaces.status,
      experience: workspaces.experience,
      displayClient: workspaces.displayClient,
    })
    .from(workspaces)
    .where(and(eq(workspaces.shareId, id), eq(workspaces.shareEnabled, true)))
    .limit(1);

  if (!workspace) {
    notFound();
  }

  if (!workspace.sandboxId || workspace.status !== "active") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="rounded-lg border border-white/20 bg-black/60 p-6">
          <p className="text-sm opacity-90">Workspace is not running</p>
        </div>
      </main>
    );
  }

  let sandbox: Awaited<ReturnType<typeof getSandbox>> | null = null;
  try {
    sandbox = await getSandbox(workspace.sandboxId);
    if (!isLiveSandboxStatus(sandbox.status)) {
      sandbox = null;
    }
  } catch {
    sandbox = null;
  }

  if (!sandbox) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="rounded-lg border border-white/20 bg-black/60 p-6">
          <p className="text-sm opacity-90">Workspace is unavailable</p>
        </div>
      </main>
    );
  }

  let displayUrl = `https://${sandbox.domains.display}`;
  if (isIframeDisplayClient(workspace.displayClient)) {
    displayUrl = getDisplayIframeUrl(workspace.displayClient, sandbox.domains.display);
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      {workspace.experience === "cli" ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-black/70 px-3 py-2 text-xs">
          cli.shared view
        </div>
      ) : null}

      {workspace.experience === "cli" ? (
        <div className="h-screen w-screen">
          <SharedTerminalViewer servicesDomain={sandbox.domains.services} session="main" />
        </div>
      ) : (
        <div className="h-screen w-screen bg-black">
          <iframe
            title={`Shared workspace ${workspace.name}`}
            src={displayUrl}
            className="h-full w-full border-0"
            tabIndex={-1}
          />
          <div className="pointer-events-none absolute inset-0" />
        </div>
      )}
    </main>
  );
}
