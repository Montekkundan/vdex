import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaceSnapshots, workspaces } from "@/lib/db/schema";
import { snapshotSandbox } from "@/lib/sandbox/client";
import { POOL_LIMITS } from "@/lib/pools/constants";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  if (!workspaceId || !name) {
    return NextResponse.json(
      { error: "workspaceId and name are required" },
      { status: 400 },
    );
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(workspaceSnapshots)
    .where(
      and(
        eq(workspaceSnapshots.userId, session.id),
        eq(workspaceSnapshots.status, "ready"),
      ),
    );

  if (total >= POOL_LIMITS.maxSnapshotsPerUser) {
    return NextResponse.json(
      {
        error: "Snapshot limit reached",
        limit: POOL_LIMITS.maxSnapshotsPerUser,
      },
      { status: 429 },
    );
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, session.id)));

  if (!workspace || !workspace.sandboxId) {
    return NextResponse.json(
      { error: "Workspace not found or not running" },
      { status: 404 },
    );
  }

  const snapshotId = await snapshotSandbox(workspace.sandboxId);

  const [created] = await db
    .insert(workspaceSnapshots)
    .values({
      userId: session.id,
      provider: workspace.provider,
      experience: workspace.experience,
      displayClient: workspace.displayClient,
      sizeProfile: workspace.sizeProfile,
      name,
      description,
      snapshotId,
      sourceWorkspaceId: workspace.id,
      sourceType: "capture",
      status: "ready",
      isDefault: false,
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json({ snapshot: created });
}
