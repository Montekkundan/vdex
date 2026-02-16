import { buildGoldenSnapshot, type GoldenSnapshotResult } from "@/lib/sandbox/build-golden-snapshot";
import {
  appendRunningRebuildJobLog,
  updateRunningRebuildJob,
  isRebuildJobRunning,
} from "@/lib/admin/snapshot-rebuild-jobs";

export async function appendRunningLogStep(jobId: string, line: string) {
  "use step";
  await appendRunningRebuildJobLog(jobId, line);
}

export async function updateRunningJobStep(
  jobId: string,
  patch: Partial<{
    status: "running" | "succeeded" | "failed";
    progress: number;
    stage: string;
    message: string | null;
    guiSnapshotId: string | null;
    cliSnapshotId: string | null;
    error: string | null;
    finishedAt: Date | null;
  }>,
) {
  "use step";
  await updateRunningRebuildJob(jobId, patch);
}

export async function isJobRunningStep(jobId: string) {
  "use step";
  return isRebuildJobRunning(jobId);
}

export async function rebuildSnapshotStep(
  jobId: string,
  options: {
    experience: "gui" | "cli";
    installScript?: string;
  },
): Promise<GoldenSnapshotResult> {
  "use step";

  const logPrefix =
    options.experience === "cli"
      ? "admin:golden-snapshot:cli"
      : "admin:golden-snapshot:gui";

  return buildGoldenSnapshot({
    installScript: options.installScript,
    logPrefix,
    experience: options.experience,
    persistAsPlatformDefault: true,
    onLog: async (line) => {
      await appendRunningRebuildJobLog(jobId, line);
    },
  });
}
