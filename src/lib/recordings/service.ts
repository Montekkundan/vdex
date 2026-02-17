import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  recordingTerminalEvents,
  recordingVideoChunks,
  workspaceRecordings,
  workspaces,
  type WorkspaceRecordingRow,
} from "@/lib/db/schema";
import { RECORDING_RETENTION_DAYS } from "@/lib/recordings/constants";
import { deleteRecordingPrefix, putRecordingObject } from "@/lib/recordings/storage";
import { renderRecordingMp4 } from "@/lib/recordings/mp4";
import type {
  RecordingDetail,
  RecordingMode,
  RecordingSummary,
  RecordingVisibility,
} from "@/types/recording";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toSummary(row: WorkspaceRecordingRow): RecordingSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sandboxId: row.sandboxId,
    mode: row.mode,
    status: row.status,
    visibility: row.visibility,
    title: row.title,
    publicId: row.publicId,
    mp4Status: row.mp4Status,
    mp4ReadyAt: row.mp4ReadyAt ? row.mp4ReadyAt.toISOString() : null,
    mp4Error: row.mp4Error,
    mp4SizeBytes: row.mp4SizeBytes,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationMs: row.durationMs,
    expiresAt: row.expiresAt.toISOString(),
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRecordings(userId: string): Promise<RecordingSummary[]> {
  await expireStaleRecordings();
  const rows = await db
    .select()
    .from(workspaceRecordings)
    .where(eq(workspaceRecordings.userId, userId))
    .orderBy(desc(workspaceRecordings.createdAt));
  return rows.map(toSummary);
}

export async function getRecordingByIdForUser(
  userId: string,
  id: string,
): Promise<RecordingDetail | null> {
  await expireStaleRecordings();

  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.id, id), eq(workspaceRecordings.userId, userId)))
    .limit(1);

  if (!row) return null;

  const [events, chunks] = await Promise.all([
    db
      .select()
      .from(recordingTerminalEvents)
      .where(eq(recordingTerminalEvents.recordingId, row.id))
      .orderBy(recordingTerminalEvents.tMs),
    db
      .select()
      .from(recordingVideoChunks)
      .where(eq(recordingVideoChunks.recordingId, row.id))
      .orderBy(recordingVideoChunks.seq),
  ]);

  return {
    ...toSummary(row),
    terminalEvents: events.map((event) => ({
      id: event.id,
      tMs: event.tMs,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
    videoChunks: chunks.map((chunk) => ({
      id: chunk.id,
      seq: chunk.seq,
      tStartMs: chunk.tStartMs,
      tEndMs: chunk.tEndMs,
      storageKey: chunk.storageKey,
      byteSize: chunk.byteSize,
      mimeType: chunk.mimeType,
      createdAt: chunk.createdAt.toISOString(),
    })),
  };
}

export async function getPublicRecordingByPublicId(publicId: string): Promise<RecordingDetail | null> {
  await expireStaleRecordings();

  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.publicId, publicId),
        eq(workspaceRecordings.visibility, "public"),
        eq(workspaceRecordings.status, "completed"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [events, chunks] = await Promise.all([
    db
      .select()
      .from(recordingTerminalEvents)
      .where(eq(recordingTerminalEvents.recordingId, row.id))
      .orderBy(recordingTerminalEvents.tMs),
    db
      .select()
      .from(recordingVideoChunks)
      .where(eq(recordingVideoChunks.recordingId, row.id))
      .orderBy(recordingVideoChunks.seq),
  ]);

  return {
    ...toSummary(row),
    terminalEvents: events.map((event) => ({
      id: event.id,
      tMs: event.tMs,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
    videoChunks: chunks.map((chunk) => ({
      id: chunk.id,
      seq: chunk.seq,
      tStartMs: chunk.tStartMs,
      tEndMs: chunk.tEndMs,
      storageKey: chunk.storageKey,
      byteSize: chunk.byteSize,
      mimeType: chunk.mimeType,
      createdAt: chunk.createdAt.toISOString(),
    })),
  };
}

export async function startRecording(input: {
  userId: string;
  workspaceId: string;
  title?: string;
  mode?: RecordingMode;
}): Promise<RecordingSummary> {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      userId: workspaces.userId,
      sandboxId: workspaces.sandboxId,
      status: workspaces.status,
      experience: workspaces.experience,
      displayClient: workspaces.displayClient,
      provider: workspaces.provider,
      sizeProfile: workspaces.sizeProfile,
      name: workspaces.name,
    })
    .from(workspaces)
    .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.userId, input.userId)))
    .limit(1);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.status !== "active" || !workspace.sandboxId) {
    throw new Error("Workspace must be running to start recording");
  }

  const [existing] = await db
    .select({ id: workspaceRecordings.id })
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.userId, input.userId),
        eq(workspaceRecordings.workspaceId, workspace.id),
        eq(workspaceRecordings.status, "recording"),
      ),
    )
    .limit(1);

  if (existing) {
    throw new Error("Recording already in progress for this workspace");
  }

  const startedAt = new Date();
  const mode: RecordingMode =
    input.mode ?? (workspace.experience === "cli" ? "cli" : "gui");

  const [row] = await db
    .insert(workspaceRecordings)
    .values({
      userId: input.userId,
      workspaceId: workspace.id,
      sandboxId: workspace.sandboxId,
      mode,
      status: "recording",
      visibility: "private",
      title: input.title?.trim() || `${workspace.name} recording`,
      startedAt,
      expiresAt: addDays(startedAt, RECORDING_RETENTION_DAYS),
      meta: {
        provider: workspace.provider,
        displayClient: workspace.displayClient,
        sizeProfile: workspace.sizeProfile,
      },
      updatedAt: new Date(),
    })
    .returning();

  if (mode === "cli") {
    await db.insert(recordingTerminalEvents).values({
      recordingId: row.id,
      tMs: 0,
      eventType: "marker",
      payload: "Recording started",
    });
  }

  return toSummary(row);
}

export async function stopRecording(input: {
  userId: string;
  recordingId: string;
}): Promise<RecordingSummary> {
  const [recording] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.id, input.recordingId),
        eq(workspaceRecordings.userId, input.userId),
      ),
    )
    .limit(1);

  if (!recording) {
    throw new Error("Recording not found");
  }

  if (recording.status !== "recording") {
    return toSummary(recording);
  }

  const endedAt = new Date();
  const durationMs = Math.max(0, endedAt.getTime() - recording.startedAt.getTime());

  const [updated] = await db
    .update(workspaceRecordings)
    .set({
      status: "completed",
      endedAt,
      durationMs,
      updatedAt: endedAt,
    })
    .where(eq(workspaceRecordings.id, recording.id))
    .returning();

  if (recording.mode === "cli") {
    await db.insert(recordingTerminalEvents).values({
      recordingId: recording.id,
      tMs: durationMs,
      eventType: "marker",
      payload: "Recording stopped",
    });
  }

  return toSummary(updated);
}

export async function updateRecording(
  userId: string,
  id: string,
  patch: { title?: string; visibility?: RecordingVisibility },
): Promise<RecordingSummary | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof patch.title === "string") {
    updates.title = patch.title.trim();
  }

  if (patch.visibility) {
    updates.visibility = patch.visibility;
  }

  const [existing] = await db
    .select()
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.id, id), eq(workspaceRecordings.userId, userId)))
    .limit(1);

  if (!existing) return null;

  if (patch.visibility === "public" && !existing.publicId) {
    updates.publicId = randomUUID();
  }

  const [updated] = await db
    .update(workspaceRecordings)
    .set(updates)
    .where(and(eq(workspaceRecordings.id, id), eq(workspaceRecordings.userId, userId)))
    .returning();

  return updated ? toSummary(updated) : null;
}

export async function deleteRecording(userId: string, id: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: workspaceRecordings.id })
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.id, id), eq(workspaceRecordings.userId, userId)))
    .limit(1);

  if (!existing) return false;

  await db.delete(workspaceRecordings).where(eq(workspaceRecordings.id, id));
  await deleteRecordingPrefix(id);
  return true;
}

export async function deleteRecordingsBulk(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const rows = await db
    .select({ id: workspaceRecordings.id })
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.userId, userId), inArray(workspaceRecordings.id, ids)));

  if (rows.length === 0) return 0;

  const foundIds = rows.map((r) => r.id);
  await db
    .delete(workspaceRecordings)
    .where(and(eq(workspaceRecordings.userId, userId), inArray(workspaceRecordings.id, foundIds)));

  await Promise.all(foundIds.map((id) => deleteRecordingPrefix(id)));
  return foundIds.length;
}

export async function getActiveRecordingForWorkspace(
  userId: string,
  workspaceId: string,
): Promise<RecordingSummary | null> {
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.userId, userId),
        eq(workspaceRecordings.workspaceId, workspaceId),
        eq(workspaceRecordings.status, "recording"),
      ),
    )
    .orderBy(desc(workspaceRecordings.createdAt))
    .limit(1);

  return row ? toSummary(row) : null;
}

export async function queueMp4Export(userId: string, recordingId: string): Promise<RecordingSummary> {
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.id, recordingId), eq(workspaceRecordings.userId, userId)))
    .limit(1);

  if (!row) throw new Error("Recording not found");
  if (row.status !== "completed") throw new Error("Recording must be completed");

  const [queued] = await db
    .update(workspaceRecordings)
    .set({
      mp4Status: "queued",
      mp4Error: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceRecordings.id, recordingId))
    .returning();

  void processMp4Export(recordingId);
  return toSummary(queued);
}

export async function processMp4Export(recordingId: string): Promise<void> {
  const [queued] = await db
    .update(workspaceRecordings)
    .set({
      mp4Status: "processing",
      mp4Error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceRecordings.id, recordingId),
        inArray(workspaceRecordings.mp4Status, ["queued", "failed", "not_requested"]),
      ),
    )
    .returning();

  if (!queued) return;

  try {
    const mp4 = await renderRecordingMp4(queued);
    const key = `${queued.id}/exports/latest.mp4`;
    const size = await putRecordingObject(key, mp4);

    await db
      .update(workspaceRecordings)
      .set({
        mp4Status: "ready",
        mp4StorageKey: key,
        mp4SizeBytes: size,
        mp4ReadyAt: new Date(),
        mp4Error: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaceRecordings.id, queued.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown MP4 export error";
    await db
      .update(workspaceRecordings)
      .set({
        mp4Status: "failed",
        mp4Error: message,
        updatedAt: new Date(),
      })
      .where(eq(workspaceRecordings.id, recordingId));
  }
}

export async function getMp4Status(
  userId: string,
  id: string,
): Promise<Pick<RecordingSummary, "id" | "mp4Status" | "mp4Error" | "mp4ReadyAt" | "mp4SizeBytes"> | null> {
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(and(eq(workspaceRecordings.id, id), eq(workspaceRecordings.userId, userId)))
    .limit(1);

  if (!row) return null;
  const summary = toSummary(row);
  return {
    id: summary.id,
    mp4Status: summary.mp4Status,
    mp4Error: summary.mp4Error,
    mp4ReadyAt: summary.mp4ReadyAt,
    mp4SizeBytes: summary.mp4SizeBytes,
  };
}

export async function getDownloadableRecordingForUser(userId: string, id: string) {
  await expireStaleRecordings();
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.id, id),
        eq(workspaceRecordings.userId, userId),
        eq(workspaceRecordings.mp4Status, "ready"),
        isNotNull(workspaceRecordings.mp4StorageKey),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getDownloadableRecordingForPublicId(publicId: string) {
  await expireStaleRecordings();
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.publicId, publicId),
        eq(workspaceRecordings.visibility, "public"),
        eq(workspaceRecordings.mp4Status, "ready"),
        isNotNull(workspaceRecordings.mp4StorageKey),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function expireStaleRecordings(): Promise<number> {
  const now = new Date();

  const stale = await db
    .select({ id: workspaceRecordings.id })
    .from(workspaceRecordings)
    .where(lte(workspaceRecordings.expiresAt, now));

  if (stale.length === 0) return 0;

  const ids = stale.map((item) => item.id);

  await db
    .update(workspaceRecordings)
    .set({
      status: "expired",
      updatedAt: now,
    })
    .where(inArray(workspaceRecordings.id, ids));

  await db.delete(workspaceRecordings).where(inArray(workspaceRecordings.id, ids));
  await Promise.all(ids.map((id) => deleteRecordingPrefix(id)));
  return ids.length;
}

export async function getLatestCompletedRecordingForWorkspace(
  userId: string,
  workspaceId: string,
): Promise<RecordingSummary | null> {
  const [row] = await db
    .select()
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.userId, userId),
        eq(workspaceRecordings.workspaceId, workspaceId),
        eq(workspaceRecordings.status, "completed"),
      ),
    )
    .orderBy(desc(workspaceRecordings.endedAt), desc(workspaceRecordings.createdAt))
    .limit(1);

  return row ? toSummary(row) : null;
}

export async function getQueuedExportIds(limit = 10): Promise<string[]> {
  const rows = await db
    .select({ id: workspaceRecordings.id })
    .from(workspaceRecordings)
    .where(eq(workspaceRecordings.mp4Status, "queued"))
    .orderBy(workspaceRecordings.updatedAt)
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.map((row) => row.id);
}

export async function appendTerminalEvent(
  recordingId: string,
  tMs: number,
  eventType: string,
  payload: string,
): Promise<void> {
  await db.insert(recordingTerminalEvents).values({
    recordingId,
    tMs,
    eventType,
    payload,
  });

  await db
    .update(workspaceRecordings)
    .set({
      sizeBytes: sql`${workspaceRecordings.sizeBytes} + ${Buffer.byteLength(payload, "utf8")}`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceRecordings.id, recordingId));
}

export async function appendTerminalEventsForUser(input: {
  userId: string;
  recordingId: string;
  events: Array<{ tMs: number; eventType: string; payload: string }>;
}): Promise<void> {
  if (input.events.length === 0) return;

  const [recording] = await db
    .select({
      id: workspaceRecordings.id,
      status: workspaceRecordings.status,
    })
    .from(workspaceRecordings)
    .where(
      and(
        eq(workspaceRecordings.id, input.recordingId),
        eq(workspaceRecordings.userId, input.userId),
      ),
    )
    .limit(1);

  if (!recording || recording.status !== "recording") {
    return;
  }

  await db.insert(recordingTerminalEvents).values(
    input.events.map((event) => ({
      recordingId: input.recordingId,
      tMs: event.tMs,
      eventType: event.eventType,
      payload: event.payload,
    })),
  );

  const bytes = input.events.reduce(
    (sum, event) => sum + Buffer.byteLength(event.payload, "utf8"),
    0,
  );
  await db
    .update(workspaceRecordings)
    .set({
      sizeBytes: sql`${workspaceRecordings.sizeBytes} + ${bytes}`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceRecordings.id, input.recordingId));
}
