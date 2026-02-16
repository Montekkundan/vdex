import {
  appendRunningLogStep,
  updateRunningJobStep,
  rebuildSnapshotStep,
  isJobRunningStep,
} from "./steps";

export type SnapshotRebuildMode = "all" | "gui" | "cli";

function getStatusCodeFromError(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const maybeStatus = (err as { status?: unknown }).status;
  if (typeof maybeStatus === "number") return maybeStatus;
  const maybeStatusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof maybeStatusCode === "number") return maybeStatusCode;
  const maybeResponseStatus = (err as { response?: { status?: unknown } }).response?.status;
  if (typeof maybeResponseStatus === "number") return maybeResponseStatus;
  return null;
}

function formatRebuildError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Unknown error";
  const status = getStatusCodeFromError(err);
  const normalized = status ?? (raw.match(/Status code\s+(\d{3})\s+is not ok/i)?.[1]
    ? Number(raw.match(/Status code\s+(\d{3})\s+is not ok/i)?.[1])
    : null);

  if (normalized === 402) {
    return "Vercel Sandbox API returned 402 (Payment Required): Sandbox quota/credits or spend limit appears exhausted for this project/token. Check billing, spending limits, and sandbox entitlement, then retry.";
  }

  return raw;
}

async function runAllRebuild(jobId: string) {
  await appendRunningLogStep(jobId, "[job] Rebuild all started");
  await updateRunningJobStep(jobId, {
    status: "running",
    progress: 10,
    stage: "rebuilding_gui",
  });
  await appendRunningLogStep(jobId, "[job] Rebuilding GUI snapshot");

  const gui = await rebuildSnapshotStep(jobId, { experience: "gui" });

  if (!(await isJobRunningStep(jobId))) {
    return;
  }

  await updateRunningJobStep(jobId, {
    progress: 55,
    stage: "rebuilding_cli",
    guiSnapshotId: gui.snapshotId,
  });
  await appendRunningLogStep(jobId, `[job] GUI snapshot ready: ${gui.snapshotId}`);
  await appendRunningLogStep(jobId, "[job] Rebuilding CLI snapshot");

  const cli = await rebuildSnapshotStep(jobId, { experience: "cli" });

  if (!(await isJobRunningStep(jobId))) {
    return;
  }

  await updateRunningJobStep(jobId, {
    progress: 85,
    stage: "finalizing",
    cliSnapshotId: cli.snapshotId,
  });
  await appendRunningLogStep(jobId, `[job] CLI snapshot ready: ${cli.snapshotId}`);

  await updateRunningJobStep(jobId, {
    status: "succeeded",
    progress: 100,
    stage: "completed",
    finishedAt: new Date(),
  });
  await appendRunningLogStep(jobId, "[job] Rebuild all completed");
}

async function runSingleRebuild(
  jobId: string,
  options: { mode: "gui" | "cli"; installScript?: string },
) {
  const label = options.mode;

  await appendRunningLogStep(jobId, `[job] Rebuild ${label} started`);
  await updateRunningJobStep(jobId, {
    status: "running",
    progress: 10,
    stage: `rebuilding_${label}`,
  });
  await appendRunningLogStep(jobId, `[job] Rebuilding ${label.toUpperCase()} snapshot`);

  const result = await rebuildSnapshotStep(jobId, {
    experience: options.mode,
    installScript: options.installScript,
  });

  if (!(await isJobRunningStep(jobId))) {
    return;
  }

  if (options.mode === "gui") {
    await updateRunningJobStep(jobId, {
      progress: 90,
      stage: "finalizing_gui",
      guiSnapshotId: result.snapshotId,
    });
  } else {
    await updateRunningJobStep(jobId, {
      progress: 90,
      stage: "finalizing_cli",
      cliSnapshotId: result.snapshotId,
    });
  }

  await updateRunningJobStep(jobId, {
    status: "succeeded",
    progress: 100,
    stage: "completed",
    guiSnapshotId: options.mode === "gui" ? result.snapshotId : null,
    cliSnapshotId: options.mode === "cli" ? result.snapshotId : null,
    finishedAt: new Date(),
  });
  await appendRunningLogStep(jobId, `[job] Rebuild ${label} completed`);
}

export async function runSnapshotRebuildWorkflow(
  jobId: string,
  mode: SnapshotRebuildMode,
  installScript?: string,
) {
  "use workflow";

  try {
    if (mode === "all") {
      await runAllRebuild(jobId);
      return;
    }

    await runSingleRebuild(jobId, {
      mode,
      installScript,
    });
  } catch (err) {
    const errorMessage = formatRebuildError(err);
    await appendRunningLogStep(jobId, `[job] Rebuild ${mode} failed: ${errorMessage}`);
    await updateRunningJobStep(jobId, {
      status: "failed",
      progress: 100,
      stage: "failed",
      error: errorMessage,
      finishedAt: new Date(),
    });
  }
}
