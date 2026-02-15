"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MainDataTable } from "@/components/ui/main-data-table";
import { Spinner } from "@/components/ui/spinner";
import { captureEvent } from "@/lib/observability/client";
import { cn } from "@/lib/utils";

interface AdminStats {
  overview?: {
    errorFreeLaunchRate24h: number;
    errorFreeLaunchRate7d: number;
    launchP50Ms: number;
    launchP95Ms: number;
    poolHitRate24h: number;
    activeIncidents: number;
    apiErrorRate24h: number;
  };
  users: {
    total: number;
    guests: number;
    admins: number;
    regular: number;
  };
  claimStats?: {
    total: number;
    hits: number;
    misses: number;
    stale: number;
    fallback: number;
  };
  topPoolUsers?: Array<{
    userId: string;
    userEmail: string | null;
    userName: string | null;
    claims: number;
  }>;
  workspaces: {
    total: number;
    active: number;
    stopped: number;
    snapshotted: number;
    creating: number;
    error: number;
  };
  warmPool: {
    total: number;
    available: number;
    claimed: number;
    expired: number;
  };
  userList: Array<{
    id: string;
    email: string | null;
    name: string | null;
    role: string;
    createdAt: string;
    workspaceCount: number;
  }>;
  recentWorkspaces: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    userName: string | null;
    userEmail: string | null;
  }>;
  usersByDay: Array<{ date: string; count: number }>;
  workspacesByStatus: Array<{ status: string; count: number }>;
}

interface Incident {
  id: string;
  kind: string;
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  title: string;
  status: "open" | "acknowledged" | "resolved";
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  affectedUsers: number;
  affectedWorkspaces: number;
}

interface SnapshotData {
  goldenSnapshot: {
    guiSnapshotId: string | null;
    guiUpdatedAt: string | null;
    cliSnapshotId: string | null;
    cliUpdatedAt: string | null;
  };
  pool: {
    target: number;
    total: number;
    available: number;
    claimed: number;
    expired: number;
    matchingSnapshot: number;
  };
  claimStats: {
    total: number;
    hits: number;
    misses: number;
    stale: number;
    fallback: number;
  };
  poolPolicies: {
    totalPolicies: number;
    enabledPolicies: number;
    totalTarget: number;
  };
  poolLimits: {
    maxSnapshotsPerUser: number;
    maxPoolBucketsPerUser: number;
    maxWarmEntriesPerUserTotal: number;
    maxTargetPerBucket: number;
    defaultMaxAgeMinutes: number;
  };
  topPoolUsers: Array<{
    userId: string;
    userEmail: string | null;
    userName: string | null;
    claims: number;
  }>;
  recentPoolEntries: Array<{
    id: string;
    sandboxId: string;
    snapshotId: string;
    status: string;
    claimedAt: string | null;
    createdAt: string;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
  }>;
  rebuildJob: {
    id: string;
    status: "running" | "succeeded" | "failed";
    progress: number;
    stage: string;
    message: string | null;
    guiSnapshotId: string | null;
    cliSnapshotId: string | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
    updatedAt: string;
  } | null;
}

type AdminUserRow = AdminStats["userList"][number];
type AdminWorkspaceRow = AdminStats["recentWorkspaces"][number];
type PoolEntryRow = SnapshotData["recentPoolEntries"][number];

const statusColors: Record<string, string> = {
  active: "border-green-300 bg-green-100 text-green-900",
  stopped: "border bg-muted text-foreground",
  snapshotted: "border-blue-300 bg-blue-100 text-blue-900",
  creating: "border-amber-300 bg-amber-100 text-amber-900",
  error: "border-red-300 bg-red-100 text-red-900",
};

const roleColors: Record<string, string> = {
  admin: "border-purple-300 bg-purple-100 text-purple-900",
  user: "border-blue-300 bg-blue-100 text-blue-900",
  guest: "border bg-muted text-foreground",
};

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border bg-background p-5">
      <p className="text-copy-13 text-foreground">{title}</p>
      <p className="mt-1 text-[28px] font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-copy-13 text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function BarChart({
  data,
  title,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  title: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="rounded-lg border border bg-background p-5">
      <h3 className="text-label-14 font-medium text-foreground mb-4">
        {title}
      </h3>
      <div className="flex items-end gap-3 h-40">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-copy-13 text-foreground font-medium tabular-nums">
              {d.value}
            </span>
            <div className="w-full flex justify-center">
              <div
                className="w-10 rounded-t-md transition-all"
                style={{
                  height: `${Math.max((d.value / max) * 120, 4)}px`,
                  backgroundColor: d.color,
                }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground text-center leading-tight">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaChart({
  data,
  title,
}: {
  data: Array<{ date: string; count: number }>;
  title: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border bg-background p-5">
        <h3 className="text-label-14 font-medium text-foreground mb-4">
          {title}
        </h3>
        <p className="text-copy-13 text-muted-foreground">No data yet</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 500;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 30, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.count / max) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  return (
    <div className="rounded-lg border border bg-background p-5">
      <h3 className="text-label-14 font-medium text-foreground mb-4">
        {title}
      </h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartH * (1 - tick)}
            y2={padding.top + chartH * (1 - tick)}
            stroke="hsl(var(--border))"
            strokeWidth="1"
          />
        ))}

        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-blue-500)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--ds-blue-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke="var(--ds-blue-700)" strokeWidth="2" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="var(--ds-blue-700)"
          />
        ))}

        {data.length <= 15 &&
          data.map((d, i) => (
            <text
              key={i}
              x={points[i].x}
              y={height - 5}
              textAnchor="middle"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {new Date(d.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </text>
          ))}

        {data.length > 15 &&
          [0, Math.floor(data.length / 2), data.length - 1].map((i) => (
            <text
              key={i}
              x={points[i].x}
              y={height - 5}
              textAnchor="middle"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {new Date(data[i].date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </text>
          ))}
      </svg>
    </div>
  );
}

function DonutChart({
  data,
  title,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  title: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="rounded-lg border border bg-background p-5">
        <h3 className="text-label-14 font-medium text-foreground mb-4">
          {title}
        </h3>
        <p className="text-copy-13 text-muted-foreground">No data yet</p>
      </div>
    );
  }

  const radius = 60;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  const arcs = data.reduce<
    {
      arcs: Array<{ label: string; color: string; dashArray: string; dashOffset: number }>;
      offset: number;
    }
  >(
    (acc, d) => {
      const pct = d.value / total;
      const dashLength = pct * circumference;
      acc.arcs.push({
        label: d.label,
        color: d.color,
        dashArray: `${dashLength} ${circumference}`,
        dashOffset: -acc.offset,
      });
      acc.offset += dashLength;
      return acc;
    },
    { arcs: [], offset: 0 },
  ).arcs;

  return (
    <div className="rounded-lg border border bg-background p-5">
      <h3 className="text-label-14 font-medium text-foreground mb-4">
        {title}
      </h3>
      <div className="flex items-center gap-6">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {arcs.map((arc) => {
            return (
              <circle
                key={arc.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                transform="rotate(-90 80 80)"
              />
            );
          })}
          <text
            x="80"
            y="80"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="24"
            fontWeight="600"
            fill="hsl(var(--foreground))"
          >
            {total}
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-copy-13 text-foreground">
                {d.label}
              </span>
              <span className="text-copy-13 text-muted-foreground tabular-nums">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "overview" | "incidents" | "users" | "workspaces" | "snapshots"
  >("overview");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-copy-14 text-red-700">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border">
        {(["overview", "incidents", "users", "workspaces", "snapshots"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-copy-14 font-medium capitalize transition-colors border-b-2 -mb-px cursor-pointer",
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab stats={stats} />}
      {tab === "incidents" && <IncidentsTab />}
      {tab === "users" && <UsersTab stats={stats} />}
      {tab === "workspaces" && <WorkspacesTab stats={stats} />}
      {tab === "snapshots" && <SnapshotsTab />}
    </div>
  );
}

function OverviewTab({ stats }: { stats: AdminStats }) {
  const chartColors = {
    active: "var(--ds-green-600)",
    stopped: "hsl(var(--muted-foreground))",
    snapshotted: "var(--ds-blue-600)",
    creating: "var(--ds-amber-600)",
    error: "var(--ds-red-600)",
  };

  const roleChartColors = {
    admin: "var(--ds-purple-600)",
    user: "var(--ds-blue-600)",
    guest: "hsl(var(--muted-foreground))",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Error-Free Launch Rate (24h)"
          value={`${(stats.overview?.errorFreeLaunchRate24h ?? 100).toFixed(1)}%`}
          subtitle={`${(stats.overview?.errorFreeLaunchRate7d ?? 100).toFixed(1)}% over 7d`}
        />
        <StatCard
          title="Active Incidents"
          value={stats.overview?.activeIncidents ?? 0}
          subtitle="Open operational incidents"
        />
        <StatCard
          title="Launch P95 (ms)"
          value={Math.round(stats.overview?.launchP95Ms ?? 0)}
          subtitle={`P50 ${Math.round(stats.overview?.launchP50Ms ?? 0)} ms`}
        />
        <StatCard
          title="Pool Hit Rate (24h)"
          value={`${(stats.overview?.poolHitRate24h ?? 0).toFixed(1)}%`}
          subtitle={`API Error Rate ${(stats.overview?.apiErrorRate24h ?? 0).toFixed(1)}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AreaChart data={stats.usersByDay} title="User Signups Over Time" />
        <DonutChart
          title="Workspaces by Status"
          data={stats.workspacesByStatus.map((d) => ({
            label: d.status,
            value: d.count,
            color:
              chartColors[d.status as keyof typeof chartColors] ??
              "hsl(var(--muted-foreground))",
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DonutChart
          title="Users by Role"
          data={[
            {
              label: "Admin",
              value: stats.users.admins,
              color: roleChartColors.admin,
            },
            {
              label: "User",
              value: stats.users.regular,
              color: roleChartColors.user,
            },
            {
              label: "Guest",
              value: stats.users.guests,
              color: roleChartColors.guest,
            },
          ]}
        />
        <BarChart
          title="Warm Pool Distribution"
          data={[
            {
              label: "Available",
              value: stats.warmPool.available,
              color: "var(--ds-green-600)",
            },
            {
              label: "Claimed",
              value: stats.warmPool.claimed,
              color: "var(--ds-blue-600)",
            },
            {
              label: "Expired",
              value: stats.warmPool.expired,
              color: "hsl(var(--muted-foreground))",
            },
          ]}
        />
      </div>
    </div>
  );
}

function IncidentsTab() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentActions, setIncidentActions] = useState<
    Array<{
      id: string;
      actionType: string;
      result: "success" | "failed";
      error: string | null;
      createdAt: string;
    }>
  >([]);
  const [posthogLinks, setPosthogLinks] = useState<{
    errorTracking: string | null;
    sessionReplay: string | null;
    activity: string | null;
  } | null>(null);
  const [posthogSearchTerm, setPosthogSearchTerm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "acknowledged" | "resolved">("all");

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qp = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/admin/incidents${qp}`);
      if (!res.ok) throw new Error("Failed to load incidents");
      const body = await res.json();
      setIncidents(body.incidents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchIncidents();
  }, [fetchIncidents]);

  useEffect(() => {
    if (!selected) {
      setIncidentActions([]);
      setPosthogLinks(null);
      setPosthogSearchTerm(null);
      return;
    }

    void fetch(`/api/admin/incidents/${selected.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setIncidentActions(data?.actions ?? []);
        setPosthogLinks(data?.posthogLinks ?? null);
        setPosthogSearchTerm(data?.posthogSearchTerm ?? null);
      })
      .catch(() => {
        setIncidentActions([]);
        setPosthogLinks(null);
        setPosthogSearchTerm(null);
      });
  }, [selected]);

  const runAction = async (actionType: string) => {
    if (!selected) return;
    setAction(actionType);
    setError(null);
    captureEvent("admin_incident_action_triggered", {
      incidentId: selected.id,
      actionType,
      severity: selected.severity,
      status: selected.status,
    });

    try {
      const res = await fetch(`/api/admin/incidents/${selected.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          targetType: "incident",
          targetId: selected.id,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      captureEvent("admin_incident_action_result", {
        incidentId: selected.id,
        actionType,
        result: "success",
      });
      await fetchIncidents();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      setError(message);
      captureEvent("admin_incident_action_result", {
        incidentId: selected.id,
        actionType,
        result: "failed",
        error: message,
      });
    } finally {
      setAction(null);
    }
  };

  const columns = useMemo<ColumnDef<Incident>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => <span className="text-copy-14 text-foreground">{row.original.title}</span>,
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              row.original.severity === "sev1" && "border-red-300 bg-red-100 text-red-900",
              row.original.severity === "sev2" && "border-amber-300 bg-amber-100 text-amber-900",
              row.original.severity === "sev3" && "border-blue-300 bg-blue-100 text-blue-900",
              row.original.severity === "sev4" && "border bg-muted text-muted-foreground",
            )}
          >
            {row.original.severity}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className={row.original.status === "open" ? "border-red-300 bg-red-100 text-red-900" : "border bg-muted text-foreground"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "occurrences",
        header: "Occurrences",
      },
      {
        accessorKey: "lastSeenAt",
        header: "Last Seen",
        cell: ({ row }) => new Date(row.original.lastSeenAt).toLocaleString(),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["all", "open", "acknowledged", "resolved"] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "secondary"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>

      {error ? <p className="text-copy-13 text-red-700">{error}</p> : null}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner size="lg" /></div>
      ) : (
        <MainDataTable
          columns={columns}
          data={incidents}
          filterColumnId="title"
          filterPlaceholder="Search incidents..."
          getRowId={(row) => row.id}
          enableRowSelection
          onSelectionChange={(rows) => setSelected(rows[0] ?? null)}
        />
      )}

      {selected ? (
        <div className="rounded-lg border border bg-background p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-label-14 font-medium text-foreground">{selected.title}</h3>
            <Badge variant="outline">{selected.status}</Badge>
          </div>
          <p className="text-copy-13 text-muted-foreground">
            {selected.kind} · {selected.occurrences} occurrences · affected users {selected.affectedUsers}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!action} onClick={() => runAction("replenish_pool")}>
              {action === "replenish_pool" ? <Spinner size="sm" /> : "Replenish Pool"}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!action} onClick={() => runAction("rebuild_gui_snapshot")}>
              {action === "rebuild_gui_snapshot" ? <Spinner size="sm" /> : "Rebuild GUI"}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!action} onClick={() => runAction("rebuild_cli_snapshot")}>
              {action === "rebuild_cli_snapshot" ? <Spinner size="sm" /> : "Rebuild CLI"}
            </Button>
            <Button size="sm" disabled={!!action} onClick={() => runAction("mark_resolved")}>
              {action === "mark_resolved" ? <Spinner size="sm" /> : "Mark Resolved"}
            </Button>
          </div>
          {(posthogLinks?.errorTracking ||
            posthogLinks?.sessionReplay ||
            posthogLinks?.activity) && (
            <div className="rounded-md border border bg-background p-3 space-y-2">
              <p className="text-copy-12 text-muted-foreground">
                Observability Links
                {posthogSearchTerm ? ` (query: ${posthogSearchTerm})` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {posthogLinks?.errorTracking ? (
                  <a
                    href={posthogLinks.errorTracking}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-md border px-3 text-copy-13 hover:bg-muted"
                  >
                    Open Error Tracking
                  </a>
                ) : null}
                {posthogLinks?.sessionReplay ? (
                  <a
                    href={posthogLinks.sessionReplay}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-md border px-3 text-copy-13 hover:bg-muted"
                  >
                    Open Session Replay
                  </a>
                ) : null}
                {posthogLinks?.activity ? (
                  <a
                    href={posthogLinks.activity}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-md border px-3 text-copy-13 hover:bg-muted"
                  >
                    Open Activity
                  </a>
                ) : null}
              </div>
            </div>
          )}
          <div className="rounded-md border border bg-background">
            <div className="px-3 py-2 border-b border text-copy-12 text-muted-foreground">
              Action Audit Trail
            </div>
            <div className="p-3 space-y-2">
              {incidentActions.length === 0 ? (
                <p className="text-copy-13 text-muted-foreground">No admin actions recorded yet.</p>
              ) : (
                incidentActions.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 text-copy-13">
                    <span className="text-foreground">{entry.actionType}</span>
                    <span className={entry.result === "failed" ? "text-red-700" : "text-green-700"}>
                      {entry.result}
                    </span>
                    <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UsersTab({ stats }: { stats: AdminStats }) {
  const columns = useMemo<ColumnDef<AdminUserRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="text-copy-14 text-foreground">{row.original.name ?? "--"}</span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-copy-14 text-foreground">{row.original.email ?? "--"}</span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge variant="outline" className={roleColors[row.original.role] ?? roleColors.guest}>
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: "workspaceCount",
        header: "Workspaces",
        cell: ({ row }) => (
          <div className="text-copy-14 text-foreground text-right tabular-nums">
            {row.original.workspaceCount}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        cell: ({ row }) => (
          <div className="text-copy-13 text-muted-foreground text-right">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <MainDataTable
      columns={columns}
      data={stats.userList}
      filterColumnId="email"
      filterPlaceholder="Filter users by email..."
      enableRowSelection
      getRowId={(row) => row.id}
    />
  );
}

function WorkspacesTab({ stats }: { stats: AdminStats }) {
  const columns = useMemo<ColumnDef<AdminWorkspaceRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="text-copy-14 text-foreground font-medium">{row.original.name}</span>
        ),
      },
      {
        id: "owner",
        accessorFn: (row) => row.userEmail ?? row.userName ?? "--",
        header: "Owner",
        cell: ({ row }) => (
          <span className="text-copy-14 text-foreground">
            {row.original.userEmail ?? row.original.userName ?? "--"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className={statusColors[row.original.status] ?? statusColors.stopped}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="text-copy-13 text-muted-foreground text-right">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <div className="text-copy-13 text-muted-foreground text-right">
            {new Date(row.original.updatedAt).toLocaleDateString()}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <MainDataTable
      columns={columns}
      data={stats.recentWorkspaces}
      filterColumnId="name"
      filterPlaceholder="Filter workspaces..."
      enableRowSelection
      getRowId={(row) => row.id}
    />
  );
}

const poolStatusColors: Record<string, string> = {
  available: "border-green-300 bg-green-100 text-green-900",
  claimed: "border-blue-300 bg-blue-100 text-blue-900",
  expired: "border bg-muted text-foreground",
};

function SnapshotsTab() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const rebuildJob = data?.rebuildJob;
  const rebuildLog = (rebuildJob?.message ?? "").trimEnd();
  const rebuildLogLines = rebuildLog ? rebuildLog.split("\n") : [];
  const rebuildLastLine =
    rebuildLogLines.length > 0
      ? rebuildLogLines[rebuildLogLines.length - 1]
      : rebuildJob?.stage ?? "queued";
  const poolColumns = useMemo<ColumnDef<PoolEntryRow>[]>(
    () => [
      {
        accessorKey: "sandboxId",
        header: "Sandbox ID",
        cell: ({ row }) => (
          <span className="text-copy-13 text-foreground font-mono">
            {row.original.sandboxId.slice(0, 16)}...
          </span>
        ),
      },
      {
        accessorKey: "snapshotId",
        header: "Snapshot",
        cell: ({ row }) => (
          <span className="text-copy-13 text-muted-foreground font-mono">
            {row.original.snapshotId === data?.goldenSnapshot.guiSnapshotId ? (
              <Badge variant="outline" className="border-green-300 bg-green-100 text-green-900">
                current
              </Badge>
            ) : (
              <span>{row.original.snapshotId.slice(0, 12)}...</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className={poolStatusColors[row.original.status] ?? poolStatusColors.expired}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "owner",
        accessorFn: (row) => row.userEmail ?? row.userName ?? "--",
        header: "Owner",
        cell: ({ row }) => (
          <span className="text-copy-13 text-muted-foreground">
            {row.original.userEmail ?? row.original.userName ?? "--"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="text-copy-13 text-muted-foreground text-right">
            {new Date(row.original.createdAt).toLocaleString()}
          </div>
        ),
      },
      {
        accessorKey: "claimedAt",
        header: "Claimed",
        cell: ({ row }) => (
          <div className="text-copy-13 text-muted-foreground text-right">
            {row.original.claimedAt
              ? new Date(row.original.claimedAt).toLocaleString()
              : "--"}
          </div>
        ),
      },
    ],
    [data?.goldenSnapshot.guiSnapshotId],
  );

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/golden-snapshot")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load snapshot data");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!rebuildJob || rebuildJob.status !== "running") return;
    const timer = setInterval(() => {
      fetchData();
    }, 3000);
    return () => clearInterval(timer);
  }, [rebuildJob, fetchData]);

  const runAction = async (action: string) => {
    setActionLoading(action);
    setActionResult(null);
    try {
      const r = await fetch("/api/admin/golden-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error ?? "Action failed");
      setActionResult({
        type: "success",
        message:
          action === "rebuild_all"
            ? "Rebuild all started. Progress will update below."
            : action === "rebuild" || action === "rebuild_gui"
            ? `New GUI snapshot created: ${result.snapshotId}`
            : action === "rebuild_cli"
              ? `New CLI snapshot created: ${result.snapshotId}`
              : "Action completed",
      });
      fetchData();
    } catch (e) {
      setActionResult({
        type: "error",
        message: e instanceof Error ? e.message : "Action failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-copy-14 text-red-700">Failed to load snapshot data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionResult && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-copy-14",
            actionResult.type === "success"
              ? "border-green-300 bg-green-100 text-green-900"
              : "border-red-300 bg-red-100 text-red-900"
          )}
        >
          {actionResult.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border bg-background p-5 space-y-4">
          <h3 className="text-label-14 font-medium text-foreground">
            Golden Snapshot
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-copy-13 text-muted-foreground">GUI Snapshot ID</span>
              <code className="text-copy-13 text-foreground bg-muted px-2 py-0.5 rounded font-mono">
                {data.goldenSnapshot.guiSnapshotId
                  ? `${data.goldenSnapshot.guiSnapshotId.slice(0, 20)}...`
                  : "None"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-copy-13 text-muted-foreground">GUI Last Updated</span>
              <span className="text-copy-13 text-foreground">
                {data.goldenSnapshot.guiUpdatedAt
                  ? new Date(data.goldenSnapshot.guiUpdatedAt).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-copy-13 text-muted-foreground">CLI Snapshot ID</span>
              <code className="text-copy-13 text-foreground bg-muted px-2 py-0.5 rounded font-mono">
                {data.goldenSnapshot.cliSnapshotId
                  ? `${data.goldenSnapshot.cliSnapshotId.slice(0, 20)}...`
                  : "None"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-copy-13 text-muted-foreground">CLI Last Updated</span>
              <span className="text-copy-13 text-foreground">
                {data.goldenSnapshot.cliUpdatedAt
                  ? new Date(data.goldenSnapshot.cliUpdatedAt).toLocaleString()
                  : "Never"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-copy-13 text-muted-foreground">
                Pool VMs on GUI snapshot
              </span>
              <span className="text-copy-13 text-foreground tabular-nums">
                {data.pool.matchingSnapshot}
              </span>
            </div>
          </div>
          <div className="pt-2 flex gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={actionLoading !== null || data.rebuildJob?.status === "running"}
              onClick={() => runAction("rebuild_all")}
            >
              {actionLoading === "rebuild_all" ? <Spinner size="sm" /> : "Rebuild All"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={actionLoading !== null}
              onClick={() => runAction("rebuild_gui")}
            >
              {actionLoading === "rebuild_gui" ? <Spinner size="sm" /> : "Rebuild GUI"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={actionLoading !== null}
              onClick={() => runAction("rebuild_cli")}
            >
              {actionLoading === "rebuild_cli" ? <Spinner size="sm" /> : "Rebuild CLI"}
            </Button>
          </div>
          {(actionLoading === "rebuild_gui" || actionLoading === "rebuild_cli") && (
            <p className="text-copy-13 text-amber-700">
              Building golden snapshot... this takes 3-8 minutes.
            </p>
          )}
          {data.rebuildJob ? (
            <div className="space-y-2 rounded-md border border p-3">
              <div className="flex items-center justify-between text-copy-13">
                <span className="text-muted-foreground">
                  {rebuildLastLine}
                </span>
                <span className="tabular-nums text-foreground">
                  {Math.max(0, Math.min(100, data.rebuildJob.progress))}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    data.rebuildJob.status === "failed"
                      ? "bg-red-600"
                      : data.rebuildJob.status === "succeeded"
                        ? "bg-green-600"
                        : "bg-blue-600",
                  )}
                  style={{
                    width: `${Math.max(0, Math.min(100, data.rebuildJob.progress))}%`,
                  }}
                />
              </div>
              <div className="text-copy-12 text-muted-foreground">
                Status: {data.rebuildJob.status} · Updated:{" "}
                {new Date(data.rebuildJob.updatedAt).toLocaleString()}
              </div>
              <div className="rounded-md border border bg-background">
                <div className="px-2 py-1 border-b border text-copy-12 text-muted-foreground">
                  Rebuild Logs
                </div>
                <pre className="max-h-56 overflow-auto p-2 text-[11px] leading-5 text-foreground font-mono whitespace-pre-wrap break-words">
                  {rebuildLog || "[job] Waiting for logs..."}
                </pre>
              </div>
              {data.rebuildJob.error ? (
                <p className="text-copy-12 text-red-800">{data.rebuildJob.error}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border bg-background p-5 space-y-4">
          <h3 className="text-label-14 font-medium text-foreground">
            Warm Pool
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-copy-13 text-muted-foreground">Available</p>
              <p className="text-[24px] font-semibold tracking-tight text-green-700 tabular-nums">
                {data.pool.available}
              </p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Target</p>
              <p className="text-[24px] font-semibold tracking-tight text-foreground tabular-nums">
                {data.pool.target}
              </p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Claimed</p>
              <p className="text-[24px] font-semibold tracking-tight text-blue-700 tabular-nums">
                {data.pool.claimed}
              </p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Expired</p>
              <p className="text-[24px] font-semibold tracking-tight text-muted-foreground tabular-nums">
                {data.pool.expired}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-copy-13 text-muted-foreground">Hit</p>
              <p className="text-copy-14 text-green-800 tabular-nums">{data.claimStats.hits}</p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Miss</p>
              <p className="text-copy-14 text-foreground tabular-nums">{data.claimStats.misses}</p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Stale</p>
              <p className="text-copy-14 text-amber-800 tabular-nums">{data.claimStats.stale}</p>
            </div>
            <div>
              <p className="text-copy-13 text-muted-foreground">Fallback</p>
              <p className="text-copy-14 text-blue-800 tabular-nums">{data.claimStats.fallback}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border bg-background p-5 space-y-3">
          <h3 className="text-label-14 font-medium text-foreground">Policy Caps</h3>
          <div className="text-copy-13 text-muted-foreground space-y-1">
            <p>Max snapshots/user: {data.poolLimits.maxSnapshotsPerUser}</p>
            <p>Max pool buckets/user: {data.poolLimits.maxPoolBucketsPerUser}</p>
            <p>Max warm entries/user: {data.poolLimits.maxWarmEntriesPerUserTotal}</p>
            <p>Max target per bucket: {data.poolLimits.maxTargetPerBucket}</p>
            <p>Default max age (minutes): {data.poolLimits.defaultMaxAgeMinutes}</p>
          </div>
          <div className="text-copy-13 text-muted-foreground">
            Policies: {data.poolPolicies.enabledPolicies}/{data.poolPolicies.totalPolicies} enabled · total target {data.poolPolicies.totalTarget}
          </div>
        </div>

        <div className="rounded-lg border border bg-background p-5 space-y-3">
          <h3 className="text-label-14 font-medium text-foreground">Top Pool Users</h3>
          <div className="space-y-2">
            {data.topPoolUsers.map((u) => (
              <div key={u.userId} className="flex items-center justify-between text-copy-13">
                <span className="truncate text-foreground">
                  {u.userEmail ?? u.userName ?? u.userId}
                </span>
                <span className="tabular-nums text-muted-foreground">{u.claims}</span>
              </div>
            ))}
            {data.topPoolUsers.length === 0 ? (
              <p className="text-copy-13 text-muted-foreground">No claim data yet.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b border bg-background">
          <h3 className="text-label-14 font-medium text-foreground">
            Recent Pool Entries
          </h3>
        </div>
        <div className="p-4">
          <MainDataTable
            columns={poolColumns}
            data={data.recentPoolEntries}
            filterColumnId="sandboxId"
            filterPlaceholder="Filter pool entries by sandbox..."
            enableRowSelection
            getRowId={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
