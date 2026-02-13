import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSandbox } from "@/lib/sandbox/client";
import { getAuthedWorkspace } from "@/lib/api/get-authed-workspace";
import { markWorkspaceStopped } from "@/lib/sandbox/mark-workspace-stopped";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";
import { getDisplayHealthPath } from "@/lib/display-clients";
import { isValidDisplayClient } from "@/lib/runtime/profiles";

async function isHttpEndpointReady(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthedWorkspace(params);
  if (result instanceof NextResponse) return result;
  const { workspace } = result;

  let sandbox = null;
  let sandboxLost = false;
  if (workspace.sandboxId) {
    try {
      const fetched = await getSandbox(workspace.sandboxId);
      if (isLiveSandboxStatus(fetched.status)) {
        sandbox = fetched;
      } else {
        sandboxLost = true;
        await markWorkspaceStopped(workspace.id);
      }
    } catch (err) {
      // Sandbox is dead (expired, crashed, etc.)
      console.warn(
        `[sandbox/${workspace.id}] Sandbox ${workspace.sandboxId} is unreachable` +
        ` (workspace: "${workspace.name}", status was: ${workspace.status}).` +
        ` ${workspace.snapshotId ? `Has snapshot ${workspace.snapshotId} for recovery.` : "No snapshot available."}` +
        ` Error: ${err instanceof Error ? err.message : err}`,
      );
      sandboxLost = true;
      await markWorkspaceStopped(workspace.id);
    }
  }

  // Re-fetch workspace after potential status update
  const current = sandboxLost
    ? (await db.select().from(workspaces).where(eq(workspaces.id, workspace.id)))[0] ?? workspace
    : workspace;

  let servicesReady = false;
  let displayReady = false;
  if (sandbox) {
    const displayClient = isValidDisplayClient(workspace.displayClient)
      ? workspace.displayClient
      : "xpra";
    servicesReady = await isHttpEndpointReady(
      `https://${sandbox.domains.services}/health`,
    );
    displayReady = await isHttpEndpointReady(
      `https://${sandbox.domains.display}${getDisplayHealthPath(displayClient)}`,
    );
  }

  return NextResponse.json({
    workspace: current,
    sandbox,
    servicesReady,
    displayReady,
    // Signal to the client that the sandbox died so it can auto-recover
    sandboxLost,
    canRecover: sandboxLost && !!(current.snapshotId),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthedWorkspace(params);
  if (result instanceof NextResponse) return result;
  const { session, workspace } = result;

  const body = await req.json();

  // If renaming, enforce unique names per user
  if (body.name) {
    const existing = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(and(eq(workspaces.userId, session.id)));
    const conflict = existing.find(
      (w) => w.id !== workspace.id && w.name.toLowerCase() === body.name.toLowerCase(),
    );
    if (conflict) {
      return NextResponse.json(
        { error: "A workspace with that name already exists" },
        { status: 409 },
      );
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.name !== undefined) updates.name = body.name;
  if (body.background !== undefined) updates.background = body.background;

  const [updated] = await db
    .update(workspaces)
    .set(updates)
    .where(and(eq(workspaces.id, workspace.id), eq(workspaces.userId, session.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ workspace: updated });
}
