import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { snapshotRebuildJobs } from "@/lib/db/schema";

type RebuildStatus = "running" | "succeeded" | "failed";

type RebuildPatch = Partial<{
  status: RebuildStatus;
  progress: number;
  stage: string;
  message: string | null;
  guiSnapshotId: string | null;
  cliSnapshotId: string | null;
  error: string | null;
  finishedAt: Date | null;
}>;

export async function updateRebuildJob(jobId: string, patch: RebuildPatch) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(snapshotRebuildJobs.id, jobId));
}

export async function updateRunningRebuildJob(jobId: string, patch: RebuildPatch) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(snapshotRebuildJobs.id, jobId),
        eq(snapshotRebuildJobs.status, "running"),
      ),
    );
}

export async function appendRebuildJobLog(jobId: string, line: string) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      message: sql`right(coalesce(${snapshotRebuildJobs.message}, '') || ${line} || E'\n', 60000)`,
      updatedAt: new Date(),
    })
    .where(eq(snapshotRebuildJobs.id, jobId));
}

export async function appendRunningRebuildJobLog(jobId: string, line: string) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      message: sql`right(coalesce(${snapshotRebuildJobs.message}, '') || ${line} || E'\n', 60000)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(snapshotRebuildJobs.id, jobId),
        eq(snapshotRebuildJobs.status, "running"),
      ),
    );
}

export async function isRebuildJobRunning(jobId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: snapshotRebuildJobs.status })
    .from(snapshotRebuildJobs)
    .where(eq(snapshotRebuildJobs.id, jobId))
    .limit(1);

  return row?.status === "running";
}
