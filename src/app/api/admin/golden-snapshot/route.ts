import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { config, warmPool, users, snapshotRebuildJobs, workspaceLaunchEvents } from "@/lib/db/schema";
import { eq, sql, desc, isNotNull, inArray, and } from "drizzle-orm";
import {
  getGoldenSnapshotId,
} from "@/lib/sandbox/golden-snapshot";
import { buildGoldenSnapshot } from "@/lib/sandbox/build-golden-snapshot";
import { getSandbox } from "@/lib/sandbox/client";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

export const maxDuration = 300;
let activeRebuildAllJobId: string | null = null;

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

async function updateRebuildJob(
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
  await db
    .update(snapshotRebuildJobs)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(snapshotRebuildJobs.id, jobId));
}

async function updateRunningRebuildJob(
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

async function appendRebuildJobLog(jobId: string, line: string) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      message: sql`right(coalesce(${snapshotRebuildJobs.message}, '') || ${line} || E'\n', 60000)`,
      updatedAt: new Date(),
    })
    .where(eq(snapshotRebuildJobs.id, jobId));
}

async function appendRunningRebuildJobLog(jobId: string, line: string) {
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

async function isRebuildJobRunning(jobId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: snapshotRebuildJobs.status })
    .from(snapshotRebuildJobs)
    .where(eq(snapshotRebuildJobs.id, jobId))
    .limit(1);

  return row?.status === "running";
}

async function runRebuildAllJob(jobId: string) {
  try {
    await appendRunningRebuildJobLog(jobId, "[job] Rebuild all started");
    await updateRunningRebuildJob(jobId, {
      status: "running",
      progress: 10,
      stage: "rebuilding_gui",
    });
    await appendRunningRebuildJobLog(jobId, "[job] Rebuilding GUI snapshot");

    const gui = await buildGoldenSnapshot({
      logPrefix: "admin:golden-snapshot:gui",
      experience: "gui",
      persistAsPlatformDefault: true,
      onLog: async (line) => appendRunningRebuildJobLog(jobId, line),
    });

    if (!(await isRebuildJobRunning(jobId))) {
      return;
    }

    await updateRunningRebuildJob(jobId, {
      progress: 55,
      stage: "rebuilding_cli",
      guiSnapshotId: gui.snapshotId,
    });
    await appendRunningRebuildJobLog(jobId, `[job] GUI snapshot ready: ${gui.snapshotId}`);
    await appendRunningRebuildJobLog(jobId, "[job] Rebuilding CLI snapshot");

    const cli = await buildGoldenSnapshot({
      logPrefix: "admin:golden-snapshot:cli",
      experience: "cli",
      persistAsPlatformDefault: true,
      onLog: async (line) => appendRunningRebuildJobLog(jobId, line),
    });

    if (!(await isRebuildJobRunning(jobId))) {
      return;
    }

    await updateRunningRebuildJob(jobId, {
      progress: 85,
      stage: "finalizing",
      cliSnapshotId: cli.snapshotId,
    });
    await appendRunningRebuildJobLog(jobId, `[job] CLI snapshot ready: ${cli.snapshotId}`);

    await updateRunningRebuildJob(jobId, {
      status: "succeeded",
      progress: 100,
      stage: "completed",
      finishedAt: new Date(),
    });
    await appendRunningRebuildJobLog(jobId, "[job] Rebuild all completed");
  } catch (err) {
    const errorMessage = formatRebuildError(err);
    await appendRunningRebuildJobLog(
      jobId,
      `[job] Rebuild all failed: ${errorMessage}`,
    );
    await updateRunningRebuildJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "failed",
      error: errorMessage,
      finishedAt: new Date(),
    });
  } finally {
    activeRebuildAllJobId = null;
  }
}

async function runSingleRebuildJob(
  jobId: string,
  options: { isCli: boolean; installScript?: string },
) {
  const { isCli, installScript } = options;
  const experience = isCli ? "cli" : "gui";
  const label = isCli ? "cli" : "gui";
  const logPrefix = isCli
    ? "admin:golden-snapshot:cli"
    : "admin:golden-snapshot:gui";

  try {
    await appendRunningRebuildJobLog(jobId, `[job] Rebuild ${label} started`);
    await updateRunningRebuildJob(jobId, {
      status: "running",
      progress: 10,
      stage: `rebuilding_${label}`,
    });
    await appendRunningRebuildJobLog(
      jobId,
      `[job] Rebuilding ${label.toUpperCase()} snapshot`,
    );

    const result = await buildGoldenSnapshot({
      installScript,
      logPrefix,
      experience,
      persistAsPlatformDefault: true,
      onLog: async (line) => appendRunningRebuildJobLog(jobId, line),
    });

    if (!(await isRebuildJobRunning(jobId))) {
      return;
    }

    if (!isCli) {
      await updateRunningRebuildJob(jobId, {
        progress: 90,
        stage: "finalizing_gui",
        guiSnapshotId: result.snapshotId,
      });
    } else {
      await updateRunningRebuildJob(jobId, {
        progress: 90,
        stage: "finalizing_cli",
        cliSnapshotId: result.snapshotId,
      });
    }

    await updateRunningRebuildJob(jobId, {
      status: "succeeded",
      progress: 100,
      stage: "completed",
      guiSnapshotId: isCli ? null : result.snapshotId,
      cliSnapshotId: isCli ? result.snapshotId : null,
      finishedAt: new Date(),
    });
    await appendRunningRebuildJobLog(jobId, `[job] Rebuild ${label} completed`);
  } catch (err) {
    const errorMessage = formatRebuildError(err);
    await appendRunningRebuildJobLog(
      jobId,
      `[job] Rebuild ${label} failed: ${errorMessage}`,
    );
    await updateRunningRebuildJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "failed",
      error: errorMessage,
      finishedAt: new Date(),
    });
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

    await appendRebuildJobLog(runningJob.id, "[job] Stop requested by admin");
    await updateRebuildJob(runningJob.id, {
      status: "failed",
      stage: "stopped_by_admin",
      error: "Stopped by admin",
      finishedAt: new Date(),
    });
    await appendRebuildJobLog(runningJob.id, "[job] Rebuild stopped by admin");

    if (activeRebuildAllJobId === runningJob.id) {
      activeRebuildAllJobId = null;
    }

    const [updatedJob] = await db
      .select()
      .from(snapshotRebuildJobs)
      .where(eq(snapshotRebuildJobs.id, runningJob.id))
      .limit(1);

    return NextResponse.json({ ok: true, stopped: true, job: updatedJob, jobId: runningJob.id }, { status: 200 });
  }

  if (action === "rebuild" || action === "rebuild_gui" || action === "rebuild_cli") {
    const isCli = action === "rebuild_cli";
    const experience = isCli ? "cli" : "gui";
    const label = isCli ? "cli" : "gui";

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

    void runSingleRebuildJob(job.id, {
      isCli,
      installScript: body.installScript,
    });

    return NextResponse.json(
      {
        ok: true,
        started: true,
        job,
        jobId: job.id,
        experience,
      },
      { status: 202 },
    );
  }

  if (action === "rebuild_all") {
    if (activeRebuildAllJobId) {
      const [running] = await db
        .select()
        .from(snapshotRebuildJobs)
        .where(eq(snapshotRebuildJobs.id, activeRebuildAllJobId))
        .limit(1);
      if (running && running.status === "running") {
        return NextResponse.json(
          { ok: true, alreadyRunning: true, job: running },
          { status: 202 },
        );
      }
      activeRebuildAllJobId = null;
    }

    const [existingRunning] = await db
      .select()
      .from(snapshotRebuildJobs)
      .where(eq(snapshotRebuildJobs.status, "running"))
      .orderBy(desc(snapshotRebuildJobs.updatedAt))
      .limit(1);
    if (existingRunning) {
      activeRebuildAllJobId = existingRunning.id;
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

    activeRebuildAllJobId = job.id;
    void runRebuildAllJob(job.id);
    return NextResponse.json({ ok: true, started: true, job }, { status: 202 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
