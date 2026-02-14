import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const workspaceStatusEnum = pgEnum("workspace_status", [
  "active",
  "stopped",
  "snapshotted",
  "creating",
  "error",
]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "guest"]);

export const appTypeEnum = pgEnum("app_type", ["builtin", "x11", "web"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  vercelId: text("vercel_id"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  sandboxId: text("sandbox_id"),
  snapshotId: text("snapshot_id"),
  icon: text("icon").default("terminal").notNull(),
  provider: text("provider").default("vercel").notNull(),
  experience: text("experience").default("gui").notNull(),
  displayClient: text("display_client").default("xpra").notNull(),
  sizeProfile: text("size_profile").default("balanced_4c8g").notNull(),
  status: workspaceStatusEnum("status").default("stopped").notNull(),
  windowState: jsonb("window_state"),
  background: text("background"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  icon: text("icon").default("/icons/default.svg").notNull(),
  type: appTypeEnum("type").notNull(),
  command: text("command"),
  component: text("component"),
  category: text("category").default("Other").notNull(),
});

export const warmPoolStatusEnum = pgEnum("warm_pool_status", [
  "available",
  "claimed",
  "expired",
]);

export const snapshotSourceTypeEnum = pgEnum("snapshot_source_type", [
  "capture",
  "script",
]);

export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "ready",
  "building",
  "failed",
  "archived",
]);

export const snapshotRefTypeEnum = pgEnum("snapshot_ref_type", [
  "platform_default",
  "user_snapshot",
]);

export const poolClaimResultEnum = pgEnum("pool_claim_result", [
  "hit",
  "miss",
  "stale",
  "fallback",
]);

export const poolClaimStatusEnum = pgEnum("pool_claim_status", [
  "pending",
  "ready",
  "claimed",
  "expired",
]);

export const snapshotRebuildJobStatusEnum = pgEnum("snapshot_rebuild_job_status", [
  "running",
  "succeeded",
  "failed",
]);

export const warmPool = pgTable("warm_pool", {
  id: uuid("id").primaryKey().defaultRandom(),
  sandboxId: text("sandbox_id").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  status: warmPoolStatusEnum("status").default("available").notNull(),
  claimedAt: timestamp("claimed_at"),
  // New ownership/trace fields (legacy rows may be null)
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  policyId: uuid("policy_id"),
  provider: text("provider"),
  experience: text("experience"),
  displayClient: text("display_client"),
  sizeProfile: text("size_profile"),
  snapshotRefType: snapshotRefTypeEnum("snapshot_ref_type"),
  snapshotRefId: uuid("snapshot_ref_id"),
  claimStatus: poolClaimStatusEnum("claim_status").default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceSnapshots = pgTable(
  "workspace_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    experience: text("experience").notNull(),
    displayClient: text("display_client"),
    sizeProfile: text("size_profile").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    snapshotId: text("snapshot_id").notNull(),
    sourceWorkspaceId: uuid("source_workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    sourceType: snapshotSourceTypeEnum("source_type").default("capture").notNull(),
    installScript: text("install_script"),
    status: snapshotStatusEnum("status").default("ready").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userNameUnique: uniqueIndex("workspace_snapshots_user_name_unique").on(
      table.userId,
      table.name,
    ),
    userSnapshotLookupIdx: index("workspace_snapshots_user_lookup_idx").on(
      table.userId,
      table.provider,
      table.experience,
      table.displayClient,
      table.sizeProfile,
      table.status,
    ),
  }),
);

export const userPoolPolicies = pgTable(
  "user_pool_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    experience: text("experience").notNull(),
    displayClient: text("display_client").notNull(),
    sizeProfile: text("size_profile").notNull(),
    snapshotRefType: snapshotRefTypeEnum("snapshot_ref_type").notNull(),
    snapshotRefId: uuid("snapshot_ref_id").references(() => workspaceSnapshots.id, {
      onDelete: "set null",
    }),
    target: integer("target").default(0).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    maxAgeMinutes: integer("max_age_minutes").default(45).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    policyUnique: uniqueIndex("user_pool_policies_unique_bucket").on(
      table.userId,
      table.provider,
      table.experience,
      table.displayClient,
      table.sizeProfile,
      table.snapshotRefType,
      table.snapshotRefId,
    ),
  }),
);

export const poolClaimEvents = pgTable(
  "pool_claim_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").references(() => warmPool.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    experience: text("experience").notNull(),
    displayClient: text("display_client").notNull(),
    sizeProfile: text("size_profile").notNull(),
    snapshotRefType: snapshotRefTypeEnum("snapshot_ref_type").notNull(),
    snapshotRefId: uuid("snapshot_ref_id").references(() => workspaceSnapshots.id, {
      onDelete: "set null",
    }),
    result: poolClaimResultEnum("result").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    claimEventsUserIdx: index("pool_claim_events_user_idx").on(table.userId, table.createdAt),
  }),
);

export const platformDefaults = pgTable(
  "platform_defaults",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    experience: text("experience").notNull(),
    displayClient: text("display_client").notNull(),
    sizeProfile: text("size_profile").notNull(),
    defaultSnapshotId: text("default_snapshot_id").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    platformDefaultsUnique: uniqueIndex("platform_defaults_bucket_unique").on(
      table.provider,
      table.experience,
      table.displayClient,
      table.sizeProfile,
    ),
  }),
);

export const snapshotRebuildJobs = pgTable(
  "snapshot_rebuild_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: snapshotRebuildJobStatusEnum("status").default("running").notNull(),
    progress: integer("progress").default(0).notNull(),
    stage: text("stage").default("queued").notNull(),
    message: text("message"),
    guiSnapshotId: text("gui_snapshot_id"),
    cliSnapshotId: text("cli_snapshot_id"),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    rebuildJobsUpdatedIdx: index("snapshot_rebuild_jobs_updated_idx").on(table.updatedAt),
  }),
);

// Global config table for things like the golden snapshot ID
export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AccountRow = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type AppRow = typeof apps.$inferSelect;
export type ConfigRow = typeof config.$inferSelect;
export type WarmPoolRow = typeof warmPool.$inferSelect;
export type WorkspaceSnapshotRow = typeof workspaceSnapshots.$inferSelect;
export type NewWorkspaceSnapshot = typeof workspaceSnapshots.$inferInsert;
export type UserPoolPolicyRow = typeof userPoolPolicies.$inferSelect;
export type NewUserPoolPolicy = typeof userPoolPolicies.$inferInsert;
export type PoolClaimEventRow = typeof poolClaimEvents.$inferSelect;
export type NewPoolClaimEvent = typeof poolClaimEvents.$inferInsert;
export type PlatformDefaultRow = typeof platformDefaults.$inferSelect;
export type SnapshotRebuildJobRow = typeof snapshotRebuildJobs.$inferSelect;
