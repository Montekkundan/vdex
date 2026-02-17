import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  bigint,
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

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    sandboxId: text("sandbox_id"),
    lastSandboxId: text("last_sandbox_id"),
    snapshotId: text("snapshot_id"),
    icon: text("icon").default("terminal").notNull(),
    provider: text("provider").default("vercel").notNull(),
    experience: text("experience").default("gui").notNull(),
    displayClient: text("display_client").default("xpra").notNull(),
    sizeProfile: text("size_profile").default("small_2c4g").notNull(),
    timeoutMs: integer("timeout_ms").default(45 * 60 * 1000).notNull(),
    runtimeStartedAt: timestamp("runtime_started_at"),
    status: workspaceStatusEnum("status").default("stopped").notNull(),
    stopReason: text("stop_reason"),
    stoppedAt: timestamp("stopped_at"),
    windowState: jsonb("window_state"),
    background: text("background"),
    shareEnabled: boolean("share_enabled").default(false).notNull(),
    shareId: text("share_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    shareIdUnique: uniqueIndex("workspaces_share_id_unique").on(table.shareId),
  }),
);

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

export const launchEventStatusEnum = pgEnum("launch_event_status", [
  "requested",
  "started",
  "ready",
  "failed",
  "timeout",
  "cancelled",
]);

export const launchEventSourceEnum = pgEnum("launch_event_source", [
  "warm_pool_hit",
  "warm_pool_miss",
  "fallback",
  "fresh",
]);

export const incidentKindEnum = pgEnum("incident_kind", [
  "workspace_error",
  "api_error",
  "snapshot_rebuild_error",
  "pool_degradation",
  "client_exception",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "sev1",
  "sev2",
  "sev3",
  "sev4",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "acknowledged",
  "resolved",
]);

export const adminActionResultEnum = pgEnum("admin_action_result", [
  "success",
  "failed",
]);

export const recordingModeEnum = pgEnum("recording_mode", ["cli", "gui"]);
export const recordingStatusEnum = pgEnum("recording_status", [
  "idle",
  "recording",
  "finalizing",
  "completed",
  "failed",
  "expired",
]);
export const recordingVisibilityEnum = pgEnum("recording_visibility", [
  "private",
  "public",
]);
export const recordingMp4StatusEnum = pgEnum("recording_mp4_status", [
  "not_requested",
  "queued",
  "processing",
  "ready",
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
    name: text("name").notNull(),
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

export const workspaceLaunchEvents = pgTable(
  "workspace_launch_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    experience: text("experience").notNull(),
    displayClient: text("display_client").notNull(),
    sizeProfile: text("size_profile").notNull(),
    source: launchEventSourceEnum("source").default("fresh").notNull(),
    status: launchEventStatusEnum("status").default("requested").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    launchEventsCreatedIdx: index("workspace_launch_events_created_idx").on(table.createdAt),
    launchEventsStatusCreatedIdx: index("workspace_launch_events_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    launchEventsUserCreatedIdx: index("workspace_launch_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    launchEventsWorkspaceCreatedIdx: index("workspace_launch_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  }),
);

export const adminIncidents = pgTable(
  "admin_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: incidentKindEnum("kind").notNull(),
    severity: incidentSeverityEnum("severity").default("sev3").notNull(),
    title: text("title").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: incidentStatusEnum("status").default("open").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    occurrences: integer("occurrences").default(1).notNull(),
    affectedUsers: integer("affected_users").default(0).notNull(),
    affectedWorkspaces: integer("affected_workspaces").default(0).notNull(),
    latestContext: jsonb("latest_context"),
    source: text("source").default("internal").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    incidentsFingerprintUnique: uniqueIndex("admin_incidents_fingerprint_unique").on(
      table.fingerprint,
    ),
    incidentsStatusSeenIdx: index("admin_incidents_status_seen_idx").on(table.status, table.lastSeenAt),
    incidentsSeveritySeenIdx: index("admin_incidents_severity_seen_idx").on(
      table.severity,
      table.lastSeenAt,
    ),
  }),
);

export const adminActionAudit = pgTable(
  "admin_action_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    incidentId: uuid("incident_id").references(() => adminIncidents.id, {
      onDelete: "set null",
    }),
    actionType: text("action_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    input: jsonb("input"),
    result: adminActionResultEnum("result").default("success").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    actionAuditAdminCreatedIdx: index("admin_action_audit_admin_created_idx").on(
      table.adminUserId,
      table.createdAt,
    ),
    actionAuditIncidentCreatedIdx: index("admin_action_audit_incident_created_idx").on(
      table.incidentId,
      table.createdAt,
    ),
  }),
);

export const apiRequestFailures = pgTable(
  "api_request_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    route: text("route").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    context: jsonb("context"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    apiFailuresRouteCreatedIdx: index("api_request_failures_route_created_idx").on(
      table.route,
      table.createdAt,
    ),
    apiFailuresStatusCreatedIdx: index("api_request_failures_status_created_idx").on(
      table.statusCode,
      table.createdAt,
    ),
  }),
);

export const workspaceRecordings = pgTable(
  "workspace_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    sandboxId: text("sandbox_id"),
    mode: recordingModeEnum("mode").notNull(),
    status: recordingStatusEnum("status").default("recording").notNull(),
    visibility: recordingVisibilityEnum("visibility").default("private").notNull(),
    title: text("title"),
    publicId: text("public_id"),
    mp4Status: recordingMp4StatusEnum("mp4_status").default("not_requested").notNull(),
    mp4StorageKey: text("mp4_storage_key"),
    mp4SizeBytes: bigint("mp4_size_bytes", { mode: "number" }),
    mp4ReadyAt: timestamp("mp4_ready_at"),
    mp4Error: text("mp4_error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    durationMs: integer("duration_ms"),
    expiresAt: timestamp("expires_at").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).default(0).notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    recordingsPublicIdUnique: uniqueIndex("workspace_recordings_public_id_unique").on(
      table.publicId,
    ),
    recordingsUserCreatedIdx: index("workspace_recordings_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    recordingsWorkspaceCreatedIdx: index("workspace_recordings_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    recordingsStatusExpiresIdx: index("workspace_recordings_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
    recordingsUserMp4StatusIdx: index("workspace_recordings_user_mp4_status_idx").on(
      table.userId,
      table.mp4Status,
    ),
  }),
);

export const recordingTerminalEvents = pgTable(
  "recording_terminal_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    recordingId: uuid("recording_id")
      .references(() => workspaceRecordings.id, { onDelete: "cascade" })
      .notNull(),
    tMs: integer("t_ms").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    terminalEventsRecordingTimeIdx: index("recording_terminal_events_recording_time_idx").on(
      table.recordingId,
      table.tMs,
    ),
  }),
);

export const recordingVideoChunks = pgTable(
  "recording_video_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .references(() => workspaceRecordings.id, { onDelete: "cascade" })
      .notNull(),
    seq: integer("seq").notNull(),
    tStartMs: integer("t_start_ms").notNull(),
    tEndMs: integer("t_end_ms").notNull(),
    storageKey: text("storage_key").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).default(0).notNull(),
    mimeType: text("mime_type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    videoChunksRecordingSeqUnique: uniqueIndex("recording_video_chunks_recording_seq_unique").on(
      table.recordingId,
      table.seq,
    ),
    videoChunksRecordingStartIdx: index("recording_video_chunks_recording_start_idx").on(
      table.recordingId,
      table.tStartMs,
    ),
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
export type WorkspaceLaunchEventRow = typeof workspaceLaunchEvents.$inferSelect;
export type NewWorkspaceLaunchEvent = typeof workspaceLaunchEvents.$inferInsert;
export type AdminIncidentRow = typeof adminIncidents.$inferSelect;
export type NewAdminIncident = typeof adminIncidents.$inferInsert;
export type AdminActionAuditRow = typeof adminActionAudit.$inferSelect;
export type NewAdminActionAudit = typeof adminActionAudit.$inferInsert;
export type ApiRequestFailureRow = typeof apiRequestFailures.$inferSelect;
export type NewApiRequestFailure = typeof apiRequestFailures.$inferInsert;
export type WorkspaceRecordingRow = typeof workspaceRecordings.$inferSelect;
export type NewWorkspaceRecording = typeof workspaceRecordings.$inferInsert;
export type RecordingTerminalEventRow = typeof recordingTerminalEvents.$inferSelect;
export type NewRecordingTerminalEvent = typeof recordingTerminalEvents.$inferInsert;
export type RecordingVideoChunkRow = typeof recordingVideoChunks.$inferSelect;
export type NewRecordingVideoChunk = typeof recordingVideoChunks.$inferInsert;
