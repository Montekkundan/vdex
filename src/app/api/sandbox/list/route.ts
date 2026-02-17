import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSandbox } from "@/lib/sandbox/client";
import { markWorkspaceStopped } from "@/lib/sandbox/mark-workspace-stopped";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";
import type { WorkspaceStopReason } from "@/types/workspace";

function inferTimeoutFromWorkspace(workspace: {
  runtimeStartedAt: Date | null;
  timeoutMs: number;
}): boolean {
  if (!workspace.runtimeStartedAt) return false;
  return Date.now() >= workspace.runtimeStartedAt.getTime() + workspace.timeoutMs;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const items = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, session.id))
    .orderBy(workspaces.createdAt);

  // Reconcile stale "active" rows: Vercel can report a sandbox as "stopped"
  // without Sandbox.get throwing.
  const reconciled = [...items];
  await Promise.all(
    reconciled.map(async (workspace, idx) => {
      if (workspace.experience !== "cli" || workspace.displayClient === "none") {
        return;
      }
      await db
        .update(workspaces)
        .set({ displayClient: "none", updatedAt: new Date() })
        .where(eq(workspaces.id, workspace.id));
      reconciled[idx] = {
        ...workspace,
        displayClient: "none",
        updatedAt: new Date(),
      };
    }),
  );

  await Promise.all(
    reconciled.map(async (workspace, idx) => {
      if (workspace.status !== "active" || !workspace.sandboxId) return;
      try {
        const sandbox = await getSandbox(workspace.sandboxId);
        if (!isLiveSandboxStatus(sandbox.status)) {
          const reason: WorkspaceStopReason =
            sandbox.status === "stopped" ? "timeout_expired" : "sandbox_inactive";
          await markWorkspaceStopped(workspace.id, reason);
          reconciled[idx] = {
            ...workspace,
            status: "stopped",
            sandboxId: null,
            stopReason: reason,
            stoppedAt: new Date(),
            lastSandboxId: workspace.sandboxId,
            updatedAt: new Date(),
          };
        }
      } catch {
        const reason: WorkspaceStopReason = inferTimeoutFromWorkspace(workspace)
          ? "timeout_expired"
          : "sandbox_unreachable";
        await markWorkspaceStopped(workspace.id, reason);
        reconciled[idx] = {
          ...workspace,
          status: "stopped",
          sandboxId: null,
          stopReason: reason,
          stoppedAt: new Date(),
          lastSandboxId: workspace.sandboxId,
          updatedAt: new Date(),
        };
      }
    }),
  );

  return NextResponse.json({ workspaces: reconciled });
}
