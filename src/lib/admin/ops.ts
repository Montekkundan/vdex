import crypto from "node:crypto";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  adminActionAudit,
  adminIncidents,
  apiRequestFailures,
  workspaceLaunchEvents,
} from "@/lib/db/schema";

export type IncidentKind =
  | "workspace_error"
  | "api_error"
  | "snapshot_rebuild_error"
  | "pool_degradation"
  | "client_exception";

export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";

export async function logWorkspaceLaunchEvent(input: {
  workspaceId?: string | null;
  userId: string;
  provider: string;
  experience: string;
  displayClient: string;
  sizeProfile: string;
  source?: "warm_pool_hit" | "warm_pool_miss" | "fallback" | "fresh";
  status: "requested" | "started" | "ready" | "failed" | "timeout" | "cancelled";
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  requestId?: string | null;
}) {
  await db.insert(workspaceLaunchEvents).values({
    workspaceId: input.workspaceId ?? null,
    userId: input.userId,
    provider: input.provider,
    experience: input.experience,
    displayClient: input.displayClient,
    sizeProfile: input.sizeProfile,
    source: input.source ?? "fresh",
    status: input.status,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    latencyMs: input.latencyMs ?? null,
    requestId: input.requestId ?? null,
  });
}

export async function upsertIncident(input: {
  kind: IncidentKind;
  severity?: IncidentSeverity;
  title: string;
  fingerprintSeed: string;
  source?: string;
  affectedUsers?: number;
  affectedWorkspaces?: number;
  latestContext?: Record<string, unknown>;
}) {
  const fingerprint = crypto
    .createHash("sha1")
    .update(`${input.kind}:${input.fingerprintSeed}`)
    .digest("hex");

  const existing = await db
    .select({ id: adminIncidents.id, occurrences: adminIncidents.occurrences })
    .from(adminIncidents)
    .where(eq(adminIncidents.fingerprint, fingerprint))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!existing) {
    const [created] = await db
      .insert(adminIncidents)
      .values({
        kind: input.kind,
        severity: input.severity ?? "sev3",
        title: input.title,
        fingerprint,
        status: "open",
        occurrences: 1,
        affectedUsers: input.affectedUsers ?? 0,
        affectedWorkspaces: input.affectedWorkspaces ?? 0,
        latestContext: input.latestContext ?? {},
        source: input.source ?? "internal",
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  const [updated] = await db
    .update(adminIncidents)
    .set({
      title: input.title,
      severity: input.severity ?? "sev3",
      occurrences: existing.occurrences + 1,
      lastSeenAt: new Date(),
      latestContext: input.latestContext ?? {},
      affectedUsers: input.affectedUsers ?? 0,
      affectedWorkspaces: input.affectedWorkspaces ?? 0,
      updatedAt: new Date(),
      status: "open",
    })
    .where(eq(adminIncidents.id, existing.id))
    .returning();

  return updated;
}

export async function logApiFailure(input: {
  route: string;
  method: string;
  statusCode: number;
  errorCode?: string;
  requestId?: string;
  userId?: string | null;
  workspaceId?: string | null;
  context?: Record<string, unknown>;
}) {
  await db.insert(apiRequestFailures).values({
    route: input.route,
    method: input.method,
    statusCode: input.statusCode,
    errorCode: input.errorCode ?? null,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    context: input.context ?? {},
  });
}

export async function getOverviewMetrics() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [launchAgg, incidentsAgg, apiAgg] = await Promise.all([
    db
      .select({
        total24h: count(sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since24h} THEN 1 END`),
        ready24h: count(
          sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since24h} AND ${workspaceLaunchEvents.status} = 'ready' THEN 1 END`,
        ),
        total7d: count(sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since7d} THEN 1 END`),
        ready7d: count(
          sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since7d} AND ${workspaceLaunchEvents.status} = 'ready' THEN 1 END`,
        ),
        poolHit24h: count(
          sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since24h} AND ${workspaceLaunchEvents.source} = 'warm_pool_hit' THEN 1 END`,
        ),
        fallback24h: count(
          sql`CASE WHEN ${workspaceLaunchEvents.createdAt} >= ${since24h} AND ${workspaceLaunchEvents.source} = 'fallback' THEN 1 END`,
        ),
        launchP50Ms: sql<number>`COALESCE(percentile_cont(0.5) within group (order by ${workspaceLaunchEvents.latencyMs}), 0)`,
        launchP95Ms: sql<number>`COALESCE(percentile_cont(0.95) within group (order by ${workspaceLaunchEvents.latencyMs}), 0)`,
      })
      .from(workspaceLaunchEvents),
    db
      .select({
        openIncidents: count(sql`CASE WHEN ${adminIncidents.status} = 'open' THEN 1 END`),
      })
      .from(adminIncidents),
    db
      .select({
        total24h: count(sql`CASE WHEN ${apiRequestFailures.createdAt} >= ${since24h} THEN 1 END`),
        serverError24h: count(
          sql`CASE WHEN ${apiRequestFailures.createdAt} >= ${since24h} AND ${apiRequestFailures.statusCode} >= 500 THEN 1 END`,
        ),
      })
      .from(apiRequestFailures),
  ]);

  const launch = launchAgg[0];
  const incidents = incidentsAgg[0];
  const api = apiAgg[0];

  const errorFreeLaunchRate24h = launch.total24h > 0 ? Number((launch.ready24h / launch.total24h) * 100) : 100;
  const errorFreeLaunchRate7d = launch.total7d > 0 ? Number((launch.ready7d / launch.total7d) * 100) : 100;
  const poolHitRate24h = launch.total24h > 0 ? Number((launch.poolHit24h / launch.total24h) * 100) : 0;
  const apiErrorRate24h = api.total24h > 0 ? Number((api.serverError24h / api.total24h) * 100) : 0;

  return {
    errorFreeLaunchRate24h,
    errorFreeLaunchRate7d,
    launchP50Ms: Number(launch.launchP50Ms ?? 0),
    launchP95Ms: Number(launch.launchP95Ms ?? 0),
    poolHitRate24h,
    fallbackCount24h: api.total24h,
    activeIncidents: incidents.openIncidents,
    apiErrorRate24h,
    totals: {
      launches24h: launch.total24h,
      launches7d: launch.total7d,
      ready24h: launch.ready24h,
    },
  };
}

export async function listIncidents(filters: {
  status?: "open" | "acknowledged" | "resolved";
  severity?: IncidentSeverity;
  kind?: IncidentKind;
  search?: string;
}) {
  const conditions = [];

  if (filters.status) conditions.push(eq(adminIncidents.status, filters.status));
  if (filters.severity) conditions.push(eq(adminIncidents.severity, filters.severity));
  if (filters.kind) conditions.push(eq(adminIncidents.kind, filters.kind));
  if (filters.search) conditions.push(ilike(adminIncidents.title, `%${filters.search}%`));

  return db
    .select()
    .from(adminIncidents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(adminIncidents.lastSeenAt))
    .limit(200);
}

export async function recordAdminAction(input: {
  adminUserId: string;
  incidentId?: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  result: "success" | "failed";
  error?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(adminActionAudit).values({
    adminUserId: input.adminUserId,
    incidentId: input.incidentId ?? null,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    result: input.result,
    error: input.error ?? null,
    input: input.payload ?? {},
  });
}

export async function getIncidentTimeline(incidentId: string) {
  const [incident, actions] = await Promise.all([
    db
      .select()
      .from(adminIncidents)
      .where(eq(adminIncidents.id, incidentId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(adminActionAudit)
      .where(eq(adminActionAudit.incidentId, incidentId))
      .orderBy(desc(adminActionAudit.createdAt))
      .limit(100),
  ]);

  return { incident, actions };
}

export async function getUserDiagnostics(userId: string) {
  const [launches, failures] = await Promise.all([
    db
      .select()
      .from(workspaceLaunchEvents)
      .where(eq(workspaceLaunchEvents.userId, userId))
      .orderBy(desc(workspaceLaunchEvents.createdAt))
      .limit(50),
    db
      .select()
      .from(apiRequestFailures)
      .where(eq(apiRequestFailures.userId, userId))
      .orderBy(desc(apiRequestFailures.createdAt))
      .limit(50),
  ]);

  return { launches, failures };
}
