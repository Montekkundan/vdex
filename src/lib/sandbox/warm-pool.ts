import { db } from "@/lib/db/client";
import { warmPool, userPoolPolicies, workspaceSnapshots } from "@/lib/db/schema";
import { eq, and, sql, count, ne } from "drizzle-orm";
import { getGoldenSnapshotId } from "./golden-snapshot";
import { createSandbox, getSandbox } from "./client";
import { isLiveSandboxStatus } from "./status";
import type { SandboxInfo } from "@/types/sandbox";
import type { DisplayClient, ProviderId, SizeProfileId, WorkspaceExperience } from "@/types/workspace";
import { POOL_LIMITS } from "@/lib/pools/constants";
import { SIZE_PROFILES } from "@/lib/runtime/profiles";
const WARM_VM_MAX_AGE_MS = 45 * 60 * 1000; // 45 min (matches sandbox timeout cap)

export interface ClaimWarmOptions {
  userId: string;
  provider: ProviderId;
  experience: WorkspaceExperience;
  displayClient: DisplayClient;
  sizeProfile: SizeProfileId;
  snapshotRefType: "platform_default" | "user_snapshot";
  snapshotRefId?: string | null;
}

/**
 * Claim a warm VM from the pool. Returns SandboxInfo if one was available,
 * null otherwise (caller should fall back to on-demand creation).
 *
 * Uses an atomic UPDATE ... LIMIT 1 to avoid races between concurrent claims.
 */
export async function claimWarmVM(options?: ClaimWarmOptions): Promise<SandboxInfo | null> {
  const staleThreshold = new Date(Date.now() - WARM_VM_MAX_AGE_MS);

  const policyWhere = options
    ? sql`
        ${warmPool.userId} = ${options.userId}
        AND ${warmPool.provider} = ${options.provider}
        AND ${warmPool.experience} = ${options.experience}
        AND ${warmPool.displayClient} = ${options.displayClient}
        AND ${warmPool.sizeProfile} = ${options.sizeProfile}
        AND ${warmPool.snapshotRefType} = ${options.snapshotRefType}
        AND ${options.snapshotRefId
          ? sql`${warmPool.snapshotRefId} = ${options.snapshotRefId}`
          : sql`${warmPool.snapshotRefId} IS NULL`}
      `
    : sql`
        ${warmPool.userId} IS NULL
        AND ${warmPool.snapshotRefType} = 'platform_default'
      `;

  // Atomic claim: grab the oldest available VM that isn't stale
  const [claimed] = await db
    .update(warmPool)
    .set({
      status: "claimed",
      claimStatus: "claimed",
      claimedAt: new Date(),
    })
    .where(
      and(
        eq(warmPool.status, "available"),
        sql`${warmPool.createdAt} > ${staleThreshold}`,
        sql`${warmPool.id} = (
          SELECT ${warmPool.id} FROM ${warmPool}
          WHERE ${warmPool.status} = 'available'
            AND ${warmPool.createdAt} > ${staleThreshold}
            AND ${policyWhere}
          ORDER BY ${warmPool.createdAt} ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )`,
      ),
    )
    .returning();

  if (!claimed) return null;

  try {
    const info = await getSandbox(claimed.sandboxId);
    if (!isLiveSandboxStatus(info.status)) {
      await db
        .update(warmPool)
        .set({ status: "expired", claimStatus: "expired" })
        .where(eq(warmPool.id, claimed.id));
      return null;
    }
    return info;
  } catch {
    // Sandbox may have died/expired -- mark it and return null
    await db
      .update(warmPool)
      .set({ status: "expired", claimStatus: "expired" })
      .where(eq(warmPool.id, claimed.id));
    return null;
  }
}

/**
 * Replenish user policy warm pools.
 * Returns how many entries were created.
 */
export async function replenishPool(): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  return replenishUserPolicies();
}

export async function replenishPoolForUser(userId: string): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  return replenishUserPolicies(userId);
}

export async function replenishPoolForPolicy(
  userId: string,
  policyId: string,
): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  return replenishUserPolicies(userId, policyId);
}

export async function expireWarmPoolEntriesForSandbox(sandboxId: string): Promise<number> {
  const expired = await db
    .update(warmPool)
    .set({ status: "expired", claimStatus: "expired" })
    .where(
      and(
        eq(warmPool.sandboxId, sandboxId),
        sql`${warmPool.status} IN ('available', 'claimed')`,
      ),
    )
    .returning({ id: warmPool.id });

  return expired.length;
}

async function expireNonLivePolicyEntries(userId: string, policyId: string) {
  const entries = await db
    .select({ id: warmPool.id, sandboxId: warmPool.sandboxId })
    .from(warmPool)
    .where(
      and(
        eq(warmPool.userId, userId),
        eq(warmPool.policyId, policyId),
        sql`${warmPool.status} IN ('available', 'claimed')`,
      ),
    );

  if (entries.length === 0) return 0;

  const expiredIds: string[] = [];
  await Promise.all(
    entries.map(async (entry) => {
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

  if (expiredIds.length === 0) return 0;

  const expired = await db
    .update(warmPool)
    .set({ status: "expired", claimStatus: "expired" })
    .where(sql`${warmPool.id} = ANY(${expiredIds})`)
    .returning({ id: warmPool.id });

  return expired.length;
}

async function replenishUserPolicies(userId?: string, policyId?: string): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  const policies = await db
    .select()
    .from(userPoolPolicies)
    .where(
      userId && policyId
        ? and(
            eq(userPoolPolicies.enabled, true),
            sql`${userPoolPolicies.target} > 0`,
            eq(userPoolPolicies.userId, userId),
            eq(userPoolPolicies.id, policyId),
          )
        : userId
        ? and(
            eq(userPoolPolicies.enabled, true),
            sql`${userPoolPolicies.target} > 0`,
            eq(userPoolPolicies.userId, userId),
          )
        : and(eq(userPoolPolicies.enabled, true), sql`${userPoolPolicies.target} > 0`),
    );

  if (policies.length === 0) return { created: 0, failed: 0, errors: [] };

  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const policy of policies) {
    await expireNonLivePolicyEntries(policy.userId, policy.id);

    const staleThreshold = new Date(
      Date.now() - policy.maxAgeMinutes * 60 * 1000,
    );

    const [snapshotRow] =
      policy.snapshotRefType === "user_snapshot" && policy.snapshotRefId
        ? await db
            .select({ snapshotId: workspaceSnapshots.snapshotId })
            .from(workspaceSnapshots)
            .where(
              and(
                eq(workspaceSnapshots.id, policy.snapshotRefId),
                eq(workspaceSnapshots.userId, policy.userId),
                eq(workspaceSnapshots.status, "ready"),
              ),
            )
        : [];

    const snapshotId =
      policy.snapshotRefType === "platform_default"
        ? await getGoldenSnapshotId(policy.experience as WorkspaceExperience)
        : snapshotRow?.snapshotId ?? null;
    if (!snapshotId) continue;

    const [{ totalUserEntries }] = await db
      .select({
        totalUserEntries: count(),
      })
      .from(warmPool)
      .where(
        and(
          eq(warmPool.userId, policy.userId),
          sql`${warmPool.status} IN ('available', 'claimed')`,
        ),
      );

    if (totalUserEntries >= POOL_LIMITS.maxWarmEntriesPerUserTotal) continue;

    const [{ availableCount }] = await db
      .select({ availableCount: count() })
      .from(warmPool)
      .where(
        and(
          eq(warmPool.userId, policy.userId),
          eq(warmPool.policyId, policy.id),
          eq(warmPool.status, "available"),
          sql`${warmPool.createdAt} > ${staleThreshold}`,
        ),
      );

    const cappedTarget = Math.min(policy.target, POOL_LIMITS.maxTargetPerBucket);
    const room = POOL_LIMITS.maxWarmEntriesPerUserTotal - totalUserEntries;
    const needed = Math.min(cappedTarget - availableCount, room);
    if (needed <= 0) continue;

    for (let i = 0; i < needed; i++) {
      try {
        const sandbox = await createSandbox(
          snapshotId,
          SIZE_PROFILES[policy.sizeProfile as SizeProfileId]
            ? {
                vcpus: SIZE_PROFILES[policy.sizeProfile as SizeProfileId].vcpu,
                memoryGb: SIZE_PROFILES[policy.sizeProfile as SizeProfileId].memoryGb,
              }
            : undefined,
          policy.displayClient as DisplayClient,
          policy.experience as WorkspaceExperience,
        );
        await db.insert(warmPool).values({
          sandboxId: sandbox.sandboxId,
          snapshotId,
          status: "available",
          claimStatus: "ready",
          userId: policy.userId,
          policyId: policy.id,
          provider: policy.provider,
          experience: policy.experience,
          displayClient: policy.displayClient,
          sizeProfile: policy.sizeProfile,
          snapshotRefType: policy.snapshotRefType,
          snapshotRefId: policy.snapshotRefId,
        });
        created++;
      } catch (err) {
        failed += 1;
        errors.push(err instanceof Error ? err.message : "Failed to create warm pool VM");
        console.error("[warm-pool] Failed to create user pool VM:", err);
      }
    }
  }

  return { created, failed, errors };
}

/**
 * Clean up stale/expired pool entries.
 * Marks old available VMs as expired so they aren't claimed.
 */
export async function prunePool(): Promise<number> {
  const staleThreshold = new Date(Date.now() - WARM_VM_MAX_AGE_MS);

  const stale = await db
    .update(warmPool)
    .set({ status: "expired", claimStatus: "expired" })
    .where(
      and(
        eq(warmPool.status, "available"),
        sql`${warmPool.createdAt} <= ${staleThreshold}`,
      ),
    )
    .returning();

  // Clean up all non-available rows older than 24h (just housekeeping)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(warmPool)
    .where(sql`${warmPool.createdAt} <= ${dayAgo}`);

  return stale.length;
}

/**
 * Expire pool VMs that belong to a snapshot other than the current golden one.
 * Call this *after* replenishPool() so new VMs are available before old ones
 * are removed (zero-downtime rotation).
 */
export async function expireOldSnapshotVMs(): Promise<number> {
  const snapshotId = await getGoldenSnapshotId("gui");
  if (!snapshotId) return 0;

  const expired = await db
    .update(warmPool)
    .set({ status: "expired", claimStatus: "expired" })
    .where(
      and(
        eq(warmPool.status, "available"),
        ne(warmPool.snapshotId, snapshotId),
      ),
    )
    .returning();

  return expired.length;
}

/**
 * Get current pool stats for debugging.
 */
export async function getPoolStats() {
  const staleThreshold = new Date(Date.now() - WARM_VM_MAX_AGE_MS);

  const [[{ available }], [{ total }]] = await Promise.all([
    db
      .select({ available: count() })
      .from(warmPool)
      .where(
        and(
          eq(warmPool.status, "available"),
          sql`${warmPool.createdAt} > ${staleThreshold}`,
        ),
      ),
    db.select({ total: count() }).from(warmPool),
  ]);

  return { available, total };
}
