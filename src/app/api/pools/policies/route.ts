import { NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { userPoolPolicies, warmPool, workspaceSnapshots } from "@/lib/db/schema";
import { POOL_LIMITS } from "@/lib/pools/constants";
import {
  validateDisplayClient,
  validateProvider,
  validateSizeProfile,
  validateWorkspaceExperience,
} from "@/lib/runtime/validation";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [policies, poolStats, policyRows, expiredEntries] = await Promise.all([
    db
      .select()
      .from(userPoolPolicies)
      .where(eq(userPoolPolicies.userId, session.id))
      .orderBy(sql`${userPoolPolicies.createdAt} DESC`),
    db
      .select({
        available: count(sql`CASE WHEN ${warmPool.status} = 'available' THEN 1 END`),
        claimed: count(sql`CASE WHEN ${warmPool.status} = 'claimed' THEN 1 END`),
        expired: count(sql`CASE WHEN ${warmPool.status} = 'expired' THEN 1 END`),
      })
      .from(warmPool)
      .where(eq(warmPool.userId, session.id)),
    db
      .select({
        policyId: warmPool.policyId,
        available: count(sql`CASE WHEN ${warmPool.status} = 'available' THEN 1 END`),
        claimed: count(sql`CASE WHEN ${warmPool.status} = 'claimed' THEN 1 END`),
      })
      .from(warmPool)
      .where(and(eq(warmPool.userId, session.id), sql`${warmPool.policyId} IS NOT NULL`))
      .groupBy(warmPool.policyId),
    db
      .select({
        id: warmPool.id,
        policyId: warmPool.policyId,
        sandboxId: warmPool.sandboxId,
        snapshotId: warmPool.snapshotId,
        status: warmPool.status,
        claimedAt: warmPool.claimedAt,
        createdAt: warmPool.createdAt,
      })
      .from(warmPool)
      .where(
        and(
          eq(warmPool.userId, session.id),
          eq(warmPool.status, "expired"),
        ),
      )
      .orderBy(sql`${warmPool.createdAt} DESC`)
      .limit(50),
  ]);

  const policyCountsById = new Map(
    policyRows.map((row) => [row.policyId, row]),
  );

  const policiesWithCounts = policies.map((policy) => {
    const counts = policyCountsById.get(policy.id);
    return {
      ...policy,
      availableCount: Number(counts?.available ?? 0),
      claimedCount: Number(counts?.claimed ?? 0),
    };
  });

  return NextResponse.json({
    policies: policiesWithCounts,
    stats: poolStats[0],
    expiredEntries,
    limits: POOL_LIMITS,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const resolvedProvider = validateProvider(body.provider ?? "vercel");
  if (!resolvedProvider.ok) {
    return NextResponse.json({ error: resolvedProvider.error.message }, { status: 400 });
  }
  const resolvedExperience = validateWorkspaceExperience(body.experience ?? "gui");
  if (!resolvedExperience.ok) {
    return NextResponse.json({ error: resolvedExperience.error.message }, { status: 400 });
  }
  const resolvedDisplayClient =
    resolvedExperience.value === "cli"
      ? { ok: true as const, value: "none" as const }
      : validateDisplayClient(body.displayClient ?? "xpra");
  if (!resolvedDisplayClient.ok) {
    return NextResponse.json({ error: resolvedDisplayClient.error.message }, { status: 400 });
  }
  const resolvedSize = validateSizeProfile(body.sizeProfile ?? "small_2c4g");
  if (!resolvedSize.ok) {
    return NextResponse.json({ error: resolvedSize.error.message }, { status: 400 });
  }
  const snapshotRefType =
    body.snapshotRefType === "user_snapshot" ? "user_snapshot" : "platform_default";
  const snapshotRefId =
    typeof body.snapshotRefId === "string" ? body.snapshotRefId : null;
  const targetInput = Number(body.target ?? 0);
  const target = Math.max(0, Math.min(POOL_LIMITS.maxTargetPerBucket, targetInput));
  const maxAgeMinutes = Number(body.maxAgeMinutes ?? POOL_LIMITS.defaultMaxAgeMinutes);
  const enabled = body.enabled !== false;

  const [[{ bucketCount }], [{ totalTarget }]] = await Promise.all([
    db
      .select({ bucketCount: count() })
      .from(userPoolPolicies)
      .where(eq(userPoolPolicies.userId, session.id)),
    db
      .select({ totalTarget: sql<number>`COALESCE(SUM(${userPoolPolicies.target}), 0)` })
      .from(userPoolPolicies)
      .where(eq(userPoolPolicies.userId, session.id)),
  ]);

  const requestedName =
    typeof body.name === "string" ? body.name.trim() : "";
  const policyName = requestedName || `Policy ${Number(bucketCount) + 1}`;

  if (bucketCount >= POOL_LIMITS.maxPoolBucketsPerUser) {
    return NextResponse.json(
      {
        error: "Pool bucket limit reached",
        limit: POOL_LIMITS.maxPoolBucketsPerUser,
      },
      { status: 429 },
    );
  }

  if (Number(totalTarget) + target > POOL_LIMITS.maxWarmEntriesPerUserTotal) {
    return NextResponse.json(
      {
        error: "Total warm entries target exceeded",
        limit: POOL_LIMITS.maxWarmEntriesPerUserTotal,
      },
      { status: 429 },
    );
  }

  if (snapshotRefType === "user_snapshot") {
    if (!snapshotRefId) {
      return NextResponse.json({ error: "snapshotRefId is required" }, { status: 400 });
    }
    const [snapshot] = await db
      .select()
      .from(workspaceSnapshots)
      .where(
        and(
          eq(workspaceSnapshots.id, snapshotRefId),
          eq(workspaceSnapshots.userId, session.id),
          eq(workspaceSnapshots.status, "ready"),
        ),
      );
    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
  }

  const [policy] = await db
    .insert(userPoolPolicies)
    .values({
      userId: session.id,
      name: policyName,
      provider: resolvedProvider.value,
      experience: resolvedExperience.value,
      displayClient: resolvedDisplayClient.value,
      sizeProfile: resolvedSize.value.id,
      snapshotRefType,
      snapshotRefId,
      target,
      maxAgeMinutes: Number.isFinite(maxAgeMinutes)
        ? Math.max(5, Math.min(180, maxAgeMinutes))
        : POOL_LIMITS.defaultMaxAgeMinutes,
      enabled,
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json({ policy });
}
