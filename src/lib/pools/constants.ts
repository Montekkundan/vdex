export const POOL_LIMITS = {
  maxSnapshotsPerUser: 10,
  maxPoolBucketsPerUser: 3,
  maxWarmEntriesPerUserTotal: 10,
  maxTargetPerBucket: 5,
  defaultMaxAgeMinutes: 45,
} as const;

export const VALID_SNAPSHOT_SOURCES = [
  "platform_default",
  "user_snapshot",
  "explicit_snapshot_id",
] as const;

export type SnapshotSource = (typeof VALID_SNAPSHOT_SOURCES)[number];
