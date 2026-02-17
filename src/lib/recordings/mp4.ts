import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { WorkspaceRecordingRow } from "@/lib/db/schema";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `Command failed with status ${code}`));
    });
  });
}

function recordingDurationSeconds(recording: WorkspaceRecordingRow): number {
  const ms = typeof recording.durationMs === "number" && recording.durationMs > 0
    ? recording.durationMs
    : 5_000;
  return Math.max(2, Math.min(120, Math.ceil(ms / 1000)));
}

export async function renderRecordingMp4(recording: WorkspaceRecordingRow): Promise<Buffer> {
  const tmpDir = path.join(os.tmpdir(), "vdex-recordings", randomUUID());
  const outPath = path.join(tmpDir, "recording.mp4");
  await fs.mkdir(tmpDir, { recursive: true });

  const duration = recordingDurationSeconds(recording);

  // Placeholder renderer for v1. Produces standards-compliant MP4 even when
  // source streams are not yet stitched to video composition.
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=1280x720:d=${duration}`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outPath,
  ]);

  const bytes = await fs.readFile(outPath);
  await fs.rm(tmpDir, { recursive: true, force: true });
  return bytes;
}
