import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { config, warmPool, poolClaimEvents, users, userPoolPolicies, snapshotRebuildJobs } from "@/lib/db/schema";
import { eq, sql, count, desc } from "drizzle-orm";
import {
  getGoldenSnapshotId,
} from "@/lib/sandbox/golden-snapshot";
import { buildGoldenSnapshot } from "@/lib/sandbox/build-golden-snapshot";
import {
  getWarmPoolTarget,
  replenishPool,
  expireOldSnapshotVMs,
  prunePool,
} from "@/lib/sandbox/warm-pool";
import { POOL_LIMITS } from "@/lib/pools/constants";

export const maxDuration = 300;
let activeRebuildAllJobId: string | null = null;

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

async function appendRebuildJobLog(jobId: string, line: string) {
  await db
    .update(snapshotRebuildJobs)
    .set({
      message: sql`right(coalesce(${snapshotRebuildJobs.message}, '') || ${line} || E'\n', 60000)`,
      updatedAt: new Date(),
    })
    .where(eq(snapshotRebuildJobs.id, jobId));
}

async function runRebuildAllJob(jobId: string) {
  try {
    await appendRebuildJobLog(jobId, "[job] Rebuild all started");
    await updateRebuildJob(jobId, {
      status: "running",
      progress: 10,
      stage: "rebuilding_gui",
    });
    await appendRebuildJobLog(jobId, "[job] Rebuilding GUI snapshot");

    const gui = await buildGoldenSnapshot({
      logPrefix: "admin:golden-snapshot:gui",
      experience: "gui",
      persistAsPlatformDefault: true,
      onLog: async (line) => appendRebuildJobLog(jobId, line),
    });

    await updateRebuildJob(jobId, {
      progress: 55,
      stage: "rebuilding_cli",
      guiSnapshotId: gui.snapshotId,
    });
    await appendRebuildJobLog(jobId, `[job] GUI snapshot ready: ${gui.snapshotId}`);
    await appendRebuildJobLog(jobId, "[job] Rebuilding CLI snapshot");

    const cli = await buildGoldenSnapshot({
      logPrefix: "admin:golden-snapshot:cli",
      experience: "cli",
      persistAsPlatformDefault: true,
      onLog: async (line) => appendRebuildJobLog(jobId, line),
    });

    await updateRebuildJob(jobId, {
      progress: 85,
      stage: "refreshing_pool",
      cliSnapshotId: cli.snapshotId,
    });
    await appendRebuildJobLog(jobId, `[job] CLI snapshot ready: ${cli.snapshotId}`);
    await appendRebuildJobLog(jobId, "[job] Refreshing warm pool");

    await expireOldSnapshotVMs();
    await prunePool();
    await replenishPool();

    await appendRebuildJobLog(jobId, "[job] Warm pool refresh done");
    await updateRebuildJob(jobId, {
      status: "succeeded",
      progress: 100,
      stage: "completed",
      finishedAt: new Date(),
    });
    await appendRebuildJobLog(jobId, "[job] Rebuild all completed");
  } catch (err) {
    await appendRebuildJobLog(
      jobId,
      `[job] Rebuild all failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    await updateRebuildJob(jobId, {
      status: "failed",
      progress: 100,
      stage: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
      finishedAt: new Date(),
    });
  } finally {
    activeRebuildAllJobId = null;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const [poolStats, claimStats, policyStats, topPoolUsers, latestRebuildJob] = await Promise.all([
    db
      .select({
        total: count(),
        available: count(
          sql`CASE WHEN ${warmPool.status} = 'available' AND ${warmPool.createdAt} > ${staleThreshold} THEN 1 END`
        ),
        claimed: count(
          sql`CASE WHEN ${warmPool.status} = 'claimed' THEN 1 END`
        ),
        expired: count(
          sql`CASE WHEN ${warmPool.status} = 'expired' THEN 1 END`
        ),
        matchingSnapshot: count(
          sql`CASE WHEN ${warmPool.snapshotId} = ${guiSnapshotId ?? ""} AND ${warmPool.status} = 'available' THEN 1 END`
        ),
      })
      .from(warmPool),
    db
      .select({
        total: count(),
        hits: count(sql`CASE WHEN ${poolClaimEvents.result} = 'hit' THEN 1 END`),
        misses: count(sql`CASE WHEN ${poolClaimEvents.result} = 'miss' THEN 1 END`),
        stale: count(sql`CASE WHEN ${poolClaimEvents.result} = 'stale' THEN 1 END`),
        fallback: count(sql`CASE WHEN ${poolClaimEvents.result} = 'fallback' THEN 1 END`),
      })
      .from(poolClaimEvents),
    db
      .select({
        totalPolicies: count(),
        enabledPolicies: count(
          sql`CASE WHEN ${userPoolPolicies.enabled} = true THEN 1 END`,
        ),
        totalTarget: sql<number>`COALESCE(SUM(${userPoolPolicies.target}), 0)`,
      })
      .from(userPoolPolicies),
    db
      .select({
        userId: poolClaimEvents.userId,
        userEmail: users.email,
        userName: users.name,
        claims: count(),
      })
      .from(poolClaimEvents)
      .leftJoin(users, eq(poolClaimEvents.userId, users.id))
      .groupBy(poolClaimEvents.userId, users.email, users.name)
      .orderBy(sql`${count()} DESC`)
      .limit(10),
    db
      .select()
      .from(snapshotRebuildJobs)
      .orderBy(desc(snapshotRebuildJobs.updatedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const recentPoolEntries = await db
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
    .orderBy(sql`${warmPool.createdAt} DESC`)
    .limit(20);

  return NextResponse.json({
    goldenSnapshot: {
      guiSnapshotId,
      guiUpdatedAt: guiConfigRow?.updatedAt?.toISOString() ?? null,
      cliSnapshotId,
      cliUpdatedAt: cliConfigRow?.updatedAt?.toISOString() ?? null,
    },
    pool: {
      target: getWarmPoolTarget(),
      ...poolStats,
    },
    claimStats: claimStats[0],
    poolPolicies: policyStats[0],
    poolLimits: POOL_LIMITS,
    topPoolUsers,
    rebuildJob: latestRebuildJob,
    recentPoolEntries,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "rebuild" || action === "rebuild_gui" || action === "rebuild_cli") {
    const isCli = action === "rebuild_cli";
    const experience = isCli ? "cli" : "gui";
    const label = isCli ? "cli" : "gui";
    const logPrefix = isCli ? "admin:golden-snapshot:cli" : "admin:golden-snapshot:gui";

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

    try {
      await appendRebuildJobLog(job.id, `[job] Rebuild ${label} started`);
      await updateRebuildJob(job.id, {
        status: "running",
        progress: 10,
        stage: `rebuilding_${label}`,
      });
      await appendRebuildJobLog(job.id, `[job] Rebuilding ${label.toUpperCase()} snapshot`);

      const result = await buildGoldenSnapshot({
        installScript: body.installScript,
        logPrefix,
        experience,
        persistAsPlatformDefault: true,
        onLog: async (line) => appendRebuildJobLog(job.id, line),
      });

      let pool: Awaited<ReturnType<typeof replenishPool>> | undefined;
      if (!isCli) {
        await updateRebuildJob(job.id, {
          progress: 80,
          stage: "refreshing_pool",
          guiSnapshotId: result.snapshotId,
        });
        await appendRebuildJobLog(job.id, "[job] Refreshing warm pool");
        await expireOldSnapshotVMs();
        await prunePool();
        pool = await replenishPool();
        await appendRebuildJobLog(job.id, "[job] Warm pool refresh done");
      } else {
        await updateRebuildJob(job.id, {
          progress: 90,
          stage: "finalizing_cli",
          cliSnapshotId: result.snapshotId,
        });
      }

      await updateRebuildJob(job.id, {
        status: "succeeded",
        progress: 100,
        stage: "completed",
        guiSnapshotId: isCli ? null : result.snapshotId,
        cliSnapshotId: isCli ? result.snapshotId : null,
        finishedAt: new Date(),
      });
      await appendRebuildJobLog(job.id, `[job] Rebuild ${label} completed`);

      return NextResponse.json({ ok: true, ...result, pool, jobId: job.id });
    } catch (err) {
      await appendRebuildJobLog(
        job.id,
        `[job] Rebuild ${label} failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      await updateRebuildJob(job.id, {
        status: "failed",
        progress: 100,
        stage: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        finishedAt: new Date(),
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Rebuild failed" },
        { status: 500 },
      );
    }
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
