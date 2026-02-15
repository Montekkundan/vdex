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

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_WARM_POOL_TARGET = process.env.NODE_ENV === "production" ? 15 : 0;
const WARM_POOL_TARGET = readEnvInt("WARM_POOL_TARGET", DEFAULT_WARM_POOL_TARGET);
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
    : sql`1 = 1`;

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
 * Replenish the warm pool up to WARM_POOL_TARGET.
 * Creates sandboxes from the golden snapshot with services started.
 * Returns how many were created.
 */
export async function replenishPool(): Promise<{
  created: number;
  target: number;
  existing: number;
}> {
  if (WARM_POOL_TARGET <= 0) {
    return { created: 0, target: WARM_POOL_TARGET, existing: 0 };
  }

  const snapshotId = await getGoldenSnapshotId("gui");
  if (!snapshotId) {
    return { created: 0, target: WARM_POOL_TARGET, existing: 0 };
  }

  const staleThreshold = new Date(Date.now() - WARM_VM_MAX_AGE_MS);

  // Count currently available (non-stale) VMs matching the current snapshot
  const [{ available }] = await db
    .select({ available: count() })
    .from(warmPool)
    .where(
      and(
        eq(warmPool.status, "available"),
        eq(warmPool.snapshotId, snapshotId),
        sql`${warmPool.createdAt} > ${staleThreshold}`,
      ),
    );

  const needed = WARM_POOL_TARGET - available;
  if (needed <= 0) {
    return { created: 0, target: WARM_POOL_TARGET, existing: available };
  }

  const CONCURRENCY = 5;
  let created = 0;

  for (let i = 0; i < needed; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, needed - i) }, () =>
      createSandbox(snapshotId)
        .then(async (sandbox) => {
          await db.insert(warmPool).values({
            sandboxId: sandbox.sandboxId,
            snapshotId,
            status: "available",
            claimStatus: "ready",
            provider: "vercel",
            experience: "gui",
            displayClient: "xpra",
            sizeProfile: "balanced_4c8g",
            snapshotRefType: "platform_default",
          });
          created++;
        })
        .catch((err) => {
          console.error("[warm-pool] Failed to create warm VM:", err);
        }),
    );
    await Promise.all(batch);
  }

  const policyCreated = await replenishUserPolicies();
  return { created: created + policyCreated, target: WARM_POOL_TARGET, existing: available };
}

async function replenishUserPolicies(): Promise<number> {
  const policies = await db
    .select()
    .from(userPoolPolicies)
    .where(and(eq(userPoolPolicies.enabled, true), sql`${userPoolPolicies.target} > 0`));

  if (policies.length === 0) return 0;

  let created = 0;
  for (const policy of policies) {
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
        console.error("[warm-pool] Failed to create user pool VM:", err);
      }
    }
  }

  return created;
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

  return { available, total, target: WARM_POOL_TARGET };
}

export function getWarmPoolTarget(): number {
  return WARM_POOL_TARGET;
}
