import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSandbox } from "@/lib/sandbox/client";
import { markWorkspaceStopped } from "@/lib/sandbox/mark-workspace-stopped";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

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
      if (workspace.status !== "active" || !workspace.sandboxId) return;
      try {
        const sandbox = await getSandbox(workspace.sandboxId);
        if (!isLiveSandboxStatus(sandbox.status)) {
          await markWorkspaceStopped(workspace.id);
          reconciled[idx] = {
            ...workspace,
            status: "stopped",
            sandboxId: null,
            updatedAt: new Date(),
          };
        }
      } catch {
        await markWorkspaceStopped(workspace.id);
        reconciled[idx] = {
          ...workspace,
          status: "stopped",
          sandboxId: null,
          updatedAt: new Date(),
        };
      }
    }),
  );

  return NextResponse.json({ workspaces: reconciled });
}
