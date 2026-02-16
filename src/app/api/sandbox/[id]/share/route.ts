import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getAuthedWorkspace } from "@/lib/api/get-authed-workspace";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthedWorkspace(params);
  if (result instanceof NextResponse) return result;

  const { workspace } = result;
  const shareUrl = workspace.shareEnabled && workspace.shareId
    ? `/share/${workspace.shareId}`
    : null;

  return NextResponse.json({
    shareEnabled: workspace.shareEnabled,
    shareId: workspace.shareId,
    shareUrl,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthedWorkspace(params);
  if (result instanceof NextResponse) return result;

  const { session, workspace } = result;
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    regenerate?: boolean;
  };

  const enable = body.enabled ?? true;
  const regenerate = body.regenerate === true;

  const updates: Record<string, unknown> = {
    shareEnabled: enable,
    updatedAt: new Date(),
  };

  if (enable && (regenerate || !workspace.shareId)) {
    updates.shareId = randomUUID();
  }

  if (!enable) {
    updates.shareId = workspace.shareId;
  }

  const [updated] = await db
    .update(workspaces)
    .set(updates)
    .where(and(eq(workspaces.id, workspace.id), eq(workspaces.userId, session.id)))
    .returning({
      id: workspaces.id,
      shareEnabled: workspaces.shareEnabled,
      shareId: workspaces.shareId,
    });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    shareEnabled: updated.shareEnabled,
    shareId: updated.shareId,
    shareUrl: updated.shareEnabled && updated.shareId ? `/share/${updated.shareId}` : null,
  });
}
