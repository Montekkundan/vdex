import { NextResponse } from "next/server";
import { snapshotSandbox, stopSandbox } from "@/lib/sandbox/client";
import { getAuthedWorkspace } from "@/lib/api/get-authed-workspace";
import { markWorkspaceStoppedWithOptions } from "@/lib/sandbox/mark-workspace-stopped";
import { enforceRateLimit, RATE_LIMIT_IDS } from "@/lib/rate-limit";
import type { WorkspaceStopReason } from "@/types/workspace";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getAuthedWorkspace(params);
  if (result instanceof NextResponse) return result;

  const rateLimited = await enforceRateLimit(
    RATE_LIMIT_IDS.sandboxStop,
    req,
    result.session.id,
    result.session.role,
  );
  if (rateLimited) return rateLimited;
  const { workspace } = result;
  const body = await req.json().catch(() => ({}));
  const createSnapshot = body?.createSnapshot === true;
  const reason = ((): WorkspaceStopReason => {
    if (typeof body?.reason !== "string") {
      return createSnapshot ? "snapshot_created" : "user_stop";
    }
    const allowed: WorkspaceStopReason[] = [
      "user_stop",
      "snapshot_created",
      "display_start_timeout",
      "timeout_expired",
      "sandbox_unreachable",
      "sandbox_inactive",
      "admin_reconcile",
      "unknown",
    ];
    return allowed.includes(body.reason as WorkspaceStopReason)
      ? (body.reason as WorkspaceStopReason)
      : (createSnapshot ? "snapshot_created" : "user_stop");
  })();
  let snapshotId: string | null = null;

  if (createSnapshot && workspace.sandboxId) {
    try {
      snapshotId = await snapshotSandbox(workspace.sandboxId);
    } catch (err) {
      console.error("Snapshot before stop error:", err);
      return NextResponse.json(
        { error: "Failed to create snapshot before shutdown" },
        { status: 500 },
      );
    }
  }

  if (workspace.sandboxId) {
    try {
      await stopSandbox(workspace.sandboxId);
    } catch (err) {
      console.error("Stop sandbox error:", err);
    }
  }

  await markWorkspaceStoppedWithOptions(workspace.id, createSnapshot
    ? { snapshotId, reason, sandboxId: workspace.sandboxId }
    : { clearSnapshot: true, reason, sandboxId: workspace.sandboxId });

  return NextResponse.json({ ok: true, snapshotId });
}
