export type RecordingMode = "cli" | "gui";

export type RecordingStatus =
  | "idle"
  | "recording"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired";

export type RecordingVisibility = "private" | "public";

export type RecordingMp4Status =
  | "not_requested"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export interface RecordingSummary {
  id: string;
  workspaceId: string | null;
  sandboxId: string | null;
  mode: RecordingMode;
  status: RecordingStatus;
  visibility: RecordingVisibility;
  title: string | null;
  publicId: string | null;
  mp4Status: RecordingMp4Status;
  mp4ReadyAt: string | null;
  mp4Error: string | null;
  mp4SizeBytes: number | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  expiresAt: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingDetail extends RecordingSummary {
  terminalEvents: Array<{
    id: number;
    tMs: number;
    eventType: string;
    payload: string;
    createdAt: string;
  }>;
  videoChunks: Array<{
    id: string;
    seq: number;
    tStartMs: number;
    tEndMs: number;
    storageKey: string;
    byteSize: number;
    mimeType: string;
    createdAt: string;
  }>;
}
