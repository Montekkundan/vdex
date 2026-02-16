import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { cancelRun } from "@workflow/core/runtime";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { config, warmPool, users, snapshotRebuildJobs, workspaceLaunchEvents } from "@/lib/db/schema";
import { eq, sql, desc, isNotNull, inArray, and } from "drizzle-orm";
import { runSnapshotRebuildWorkflow, type SnapshotRebuildMode } from "@/workflows/snapshot-rebuild";
import {
  appendRebuildJobLog,
  updateRebuildJob,
} from "@/lib/admin/snapshot-rebuild-jobs";
import {
  getGoldenSnapshotId,
} from "@/lib/sandbox/golden-snapshot";
import { getSandbox } from "@/lib/sandbox/client";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

export const maxDuration = 300;

function extractWorkflowRunIdFromLogs(message: string | null): string | null {
  if (!message) return null;
  const matches = [...message.matchAll(/\[job\]\s+workflow_run_id:\s*([^\s\n]+)/g)];
  const last = matches[matches.length - 1];
  return last?.[1] ?? null;
}

async function cancelWorkflowRunIfPresent(runId: string | null): Promise<boolean> {
  if (!runId) return false;
  try {
    await cancelRun(getWorld(), runId);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const requestedJobId = new URL(req.url).searchParams.get("jobId");

  const [guiSnapshotId, cliSnapshotId] = await Promise.all([
    getGoldenSnapshotId("gui"),
    getGoldenSnapshotId("cli"),
  ]);

  const [guiConfigRow] = await db
    .select()
    .from(config)
    .where(eq(config.key, "golden_snapshot_gui_id"));

  const [cliConfigRow] = await db
    .select()
    .from(config)
    .where(eq(config.key, "golden_snapshot_cli_id"));

  const [recentPoolEntries, rebuildJob, launchTraceRow] = await Promise.all([
    db
      .select({
        id: warmPool.id,
        sandboxId: warmPool.sandboxId,
        snapshotId: warmPool.snapshotId,
        status: warmPool.status,
        claimedAt: warmPool.claimedAt,
        createdAt: warmPool.createdAt,
        userId: warmPool.userId,
        userEmail: users.email,
        userName: users.name,
      })
      .from(warmPool)
      .leftJoin(users, eq(warmPool.userId, users.id))
      .where(isNotNull(warmPool.userId))
      .orderBy(sql`${warmPool.createdAt} DESC`)
      .limit(20),
    (requestedJobId
      ? db
          .select()
          .from(snapshotRebuildJobs)
          .where(eq(snapshotRebuildJobs.id, requestedJobId))
          .limit(1)
      : db
          .select()
          .from(snapshotRebuildJobs)
          .orderBy(desc(snapshotRebuildJobs.updatedAt))
          .limit(1)
    ).then((rows) => rows[0] ?? null),
    db
      .select({
        total24h: sql<number>`count(*)`,
        warmPoolHit24h: sql<number>`sum(case when ${workspaceLaunchEvents.source} = 'warm_pool_hit' then 1 else 0 end)`,
        coldBoot24h: sql<number>`sum(case when ${workspaceLaunchEvents.source} in ('fresh', 'fallback', 'warm_pool_miss') then 1 else 0 end)`,
      })
      .from(workspaceLaunchEvents)
      .where(sql`${workspaceLaunchEvents.createdAt} >= now() - interval '24 hours'`)
      .then((rows) => rows[0] ?? null),
  ]);

  const launchTrace = {
    total24h: Number(launchTraceRow?.total24h ?? 0),
    warmPoolHit24h: Number(launchTraceRow?.warmPoolHit24h ?? 0),
    coldBoot24h: Number(launchTraceRow?.coldBoot24h ?? 0),
  };

  const livenessCandidates = recentPoolEntries.filter(
    (entry) => entry.status === "available" || entry.status === "claimed",
  );

  const expiredIds: string[] = [];
  await Promise.all(
    livenessCandidates.map(async (entry) => {
      try {
        const sandbox = await getSandbox(entry.sandboxId);
        if (!isLiveSandboxStatus(sandbox.status)) {
          expiredIds.push(entry.id);
        }
      } catch {
        expiredIds.push(entry.id);
      }
    }),
  );

  if (expiredIds.length > 0) {
    await db
      .update(warmPool)
      .set({ status: "expired", claimStatus: "expired" })
      .where(inArray(warmPool.id, expiredIds));
  }

  const recentPoolEntriesWithLiveness = recentPoolEntries.map((entry) =>
    expiredIds.includes(entry.id)
      ? { ...entry, status: "expired" }
      : entry,
  );

  return NextResponse.json({
    goldenSnapshot: {
      guiSnapshotId,
      guiUpdatedAt: guiConfigRow?.updatedAt?.toISOString() ?? null,
      cliSnapshotId,
      cliUpdatedAt: cliConfigRow?.updatedAt?.toISOString() ?? null,
    },
    recentPoolEntries: recentPoolEntriesWithLiveness,
    launchTrace,
    rebuildJob,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "stop_rebuild") {
    const requestedJobId = typeof body.jobId === "string" ? body.jobId : null;

    const [runningJob] = requestedJobId
      ? await db
          .select()
          .from(snapshotRebuildJobs)
          .where(
            and(
              eq(snapshotRebuildJobs.id, requestedJobId),
              eq(snapshotRebuildJobs.status, "running"),
            ),
          )
          .limit(1)
      : await db
          .select()
          .from(snapshotRebuildJobs)
          .where(eq(snapshotRebuildJobs.status, "running"))
          .orderBy(desc(snapshotRebuildJobs.updatedAt))
          .limit(1);

    if (!runningJob) {
      return NextResponse.json({ error: "No running rebuild job found" }, { status: 404 });
    }

    const workflowRunId = extractWorkflowRunIdFromLogs(runningJob.message);

    await appendRebuildJobLog(runningJob.id, "[job] Stop requested by admin");
    if (workflowRunId) {
      const cancelled = await cancelWorkflowRunIfPresent(workflowRunId);
      await appendRebuildJobLog(
        runningJob.id,
        cancelled
          ? `[job] Workflow run cancelled: ${workflowRunId}`
          : `[job] Workflow cancellation failed or not found: ${workflowRunId}`,
      );
    }
    await updateRebuildJob(runningJob.id, {
      status: "failed",
      stage: "stopped_by_admin",
      error: "Stopped by admin",
      finishedAt: new Date(),
    });
    await appendRebuildJobLog(runningJob.id, "[job] Rebuild stopped by admin");

    const [updatedJob] = await db
      .select()
      .from(snapshotRebuildJobs)
      .where(eq(snapshotRebuildJobs.id, runningJob.id))
      .limit(1);

    return NextResponse.json({ ok: true, stopped: true, job: updatedJob, jobId: runningJob.id }, { status: 200 });
  }

  if (action === "rebuild" || action === "rebuild_gui" || action === "rebuild_cli") {
    const isCli = action === "rebuild_cli";
    const label = isCli ? "cli" : "gui";
    const mode: SnapshotRebuildMode = isCli ? "cli" : "gui";

    const [existingRunning] = await db
      .select()
      .from(snapshotRebuildJobs)
      .where(eq(snapshotRebuildJobs.status, "running"))
      .orderBy(desc(snapshotRebuildJobs.updatedAt))
      .limit(1);
    if (existingRunning) {
      return NextResponse.json(
        { ok: true, alreadyRunning: true, job: existingRunning },
        { status: 202 },
      );
    }

    const [job] = await db
      .insert(snapshotRebuildJobs)
      .values({
        status: "running",
        progress: 0,
        stage: `queued_${label}`,
        message: `[job] Queued rebuild ${label}\n`,
        updatedAt: new Date(),
      })
      .returning();

    const run = await start(runSnapshotRebuildWorkflow, [
      job.id,
      mode,
      typeof body.installScript === "string" ? body.installScript : undefined,
    ]);
    await appendRebuildJobLog(job.id, `[job] workflow_run_id: ${run.runId}`);

    return NextResponse.json(
      {
        ok: true,
        started: true,
        job,
        jobId: job.id,
        runId: run.runId,
        experience: mode,
      },
      { status: 202 },
    );
  }

  if (action === "rebuild_all") {
    const [existingRunning] = await db
      .select()
      .from(snapshotRebuildJobs)
      .where(eq(snapshotRebuildJobs.status, "running"))
      .orderBy(desc(snapshotRebuildJobs.updatedAt))
      .limit(1);
    if (existingRunning) {
      return NextResponse.json(
        { ok: true, alreadyRunning: true, job: existingRunning },
        { status: 202 },
      );
    }

    const [job] = await db
      .insert(snapshotRebuildJobs)
      .values({
        status: "running",
        progress: 0,
        stage: "queued",
        message: "[job] Queued rebuild all\n",
        updatedAt: new Date(),
      })
      .returning();

    const run = await start(runSnapshotRebuildWorkflow, [job.id, "all"]);
    await appendRebuildJobLog(job.id, `[job] workflow_run_id: ${run.runId}`);
    return NextResponse.json({ ok: true, started: true, job, runId: run.runId }, { status: 202 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
