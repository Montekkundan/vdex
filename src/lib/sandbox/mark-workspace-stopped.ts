import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { WorkspaceStopReason } from "@/types/workspace";

/**
 * Mark a workspace as stopped with no active sandbox in the database.
 * Centralizes the DB update that was previously duplicated across
 * GET /api/sandbox/[id], POST /api/sandbox/[id]/stop, and
 * POST /api/sandbox/[id]/extend.
 */
export async function markWorkspaceStoppedWithOptions(
  workspaceId: string,
  options?: {
    reason?: WorkspaceStopReason;
    snapshotId?: string | null;
    clearSnapshot?: boolean;
    sandboxId?: string | null;
  },
) {
  const [workspace] = await db
    .select({
      sandboxId: workspaces.sandboxId,
      lastSandboxId: workspaces.lastSandboxId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const stoppedAt = new Date();
  const updates: {
    status: "stopped";
    sandboxId: null;
    lastSandboxId?: string | null;
    stopReason?: WorkspaceStopReason | null;
    stoppedAt: Date;
    updatedAt: Date;
    snapshotId?: string | null;
  } = {
    status: "stopped",
    sandboxId: null,
    lastSandboxId:
      options?.sandboxId ??
      workspace?.sandboxId ??
      workspace?.lastSandboxId ??
      null,
    stopReason: options?.reason ?? "unknown",
    stoppedAt,
    updatedAt: stoppedAt,
  };

  if (options?.clearSnapshot) updates.snapshotId = null;
  if (options && "snapshotId" in options) updates.snapshotId = options.snapshotId ?? null;

  await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, workspaceId));
}

export async function markWorkspaceStopped(
  workspaceId: string,
  reason: WorkspaceStopReason = "unknown",
) {
  await markWorkspaceStoppedWithOptions(workspaceId, { reason });
}
