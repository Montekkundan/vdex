import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { adminIncidents, workspaces } from "@/lib/db/schema";
import { buildGoldenSnapshot } from "@/lib/sandbox/build-golden-snapshot";
import { recordAdminAction } from "@/lib/admin/ops";
import { markWorkspaceStoppedWithOptions } from "@/lib/sandbox/mark-workspace-stopped";

const SAFE_ACTIONS = new Set([
  "reconcile_workspace",
  "restart_workspace",
  "rebuild_gui_snapshot",
  "rebuild_cli_snapshot",
  "mark_resolved",
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    actionType?: string;
    targetType?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.actionType || !SAFE_ACTIONS.has(body.actionType)) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    let result: Record<string, unknown> = { ok: true };

    if (body.actionType === "mark_resolved") {
      await db
        .update(adminIncidents)
        .set({ status: "resolved", updatedAt: new Date() })
        .where(eq(adminIncidents.id, id));
      result = { status: "resolved" };
    }

    if (body.actionType === "rebuild_gui_snapshot") {
      const snapshot = await buildGoldenSnapshot({
        experience: "gui",
        logPrefix: "admin:incident:rebuild-gui",
        persistAsPlatformDefault: true,
      });
      result = { snapshotId: snapshot.snapshotId };
    }

    if (body.actionType === "rebuild_cli_snapshot") {
      const snapshot = await buildGoldenSnapshot({
        experience: "cli",
        logPrefix: "admin:incident:rebuild-cli",
        persistAsPlatformDefault: true,
      });
      result = { snapshotId: snapshot.snapshotId };
    }

    if (body.actionType === "restart_workspace" || body.actionType === "reconcile_workspace") {
      if (!body.targetId) {
        return NextResponse.json({ error: "targetId required" }, { status: 400 });
      }

      const [current] = await db
        .select({
          id: workspaces.id,
          sandboxId: workspaces.sandboxId,
        })
        .from(workspaces)
        .where(eq(workspaces.id, body.targetId));
      if (!current) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      await markWorkspaceStoppedWithOptions(current.id, {
        reason: "admin_reconcile",
        sandboxId: current.sandboxId,
      });
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, body.targetId));

      result = { workspaceId: workspace?.id ?? null, status: workspace?.status ?? null };
    }

    await recordAdminAction({
      adminUserId: session.id,
      incidentId: id,
      actionType: body.actionType,
      targetType: body.targetType ?? "incident",
      targetId: body.targetId ?? id,
      payload: body.payload,
      result: "success",
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await recordAdminAction({
      adminUserId: session.id,
      incidentId: id,
      actionType: body.actionType,
      targetType: body.targetType ?? "incident",
      targetId: body.targetId ?? id,
      payload: body.payload,
      result: "failed",
      error: error instanceof Error ? error.message : "Unknown action error",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 },
    );
  }
}
