"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { MainDataTable } from "@/components/ui/main-data-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/lib/swr";

type SandboxListItem = {
  id: string;
  status: "aborted" | "pending" | "running" | "stopping" | "stopped" | "failed" | "snapshotting";
  runtime: string;
  vcpus: number;
  memory: number;
  region: string;
  timeout: number;
  sourceSnapshotId?: string;
  createdAt: number;
  updatedAt: number;
};

type SnapshotListItem = {
  id: string;
  status: "failed" | "created" | "deleted";
  sizeBytes: number;
  sourceSandboxId: string;
  createdAt: number;
  expiresAt: number;
  region: string;
};

type SandboxesResponse = {
  sandboxes: SandboxListItem[];
};

type SnapshotsResponse = {
  snapshots: SnapshotListItem[];
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

const SANDBOX_BADGE: Record<string, string> = {
  running: "bg-green-100 text-green-900 border-green-300",
  pending: "bg-blue-100 text-blue-900 border-blue-300",
  snapshotting: "bg-blue-100 text-blue-900 border-blue-300",
  stopping: "bg-yellow-100 text-yellow-900 border-yellow-300",
  stopped: "bg-gray-alpha-100 text-gray-900 border-gray-alpha-300",
  failed: "bg-red-100 text-red-900 border-red-300",
  aborted: "bg-red-100 text-red-900 border-red-300",
};

const SNAPSHOT_BADGE: Record<string, string> = {
  created: "bg-green-100 text-green-900 border-green-300",
  failed: "bg-red-100 text-red-900 border-red-300",
  deleted: "bg-gray-alpha-100 text-gray-900 border-gray-alpha-300",
};

export function SandboxesClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectTitle, setInspectTitle] = useState("");
  const [inspectJson, setInspectJson] = useState("");
  const [showStoppedSandboxes, setShowStoppedSandboxes] = useState(false);
  const [showDeletedSnapshots, setShowDeletedSnapshots] = useState(false);
  const [selectedSandboxes, setSelectedSandboxes] = useState<SandboxListItem[]>([]);
  const [selectedSnapshots, setSelectedSnapshots] = useState<SnapshotListItem[]>([]);

  const {
    data: sandboxesData,
    isLoading: sandboxesLoading,
    mutate: mutateSandboxes,
  } = useSWR<SandboxesResponse>("/api/vercel/sandboxes", fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  });
  const {
    data: snapshotsData,
    isLoading: snapshotsLoading,
    mutate: mutateSnapshots,
  } = useSWR<SnapshotsResponse>("/api/vercel/snapshots", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const sandboxes = useMemo(() => sandboxesData?.sandboxes ?? [], [sandboxesData]);
  const snapshots = useMemo(() => snapshotsData?.snapshots ?? [], [snapshotsData]);
  const visibleSandboxes = useMemo(
    () =>
      showStoppedSandboxes
        ? sandboxes
        : sandboxes.filter((s) => s.status !== "stopped"),
    [sandboxes, showStoppedSandboxes],
  );
  const visibleSnapshots = useMemo(
    () =>
      showDeletedSnapshots
        ? snapshots
        : snapshots.filter((s) => s.status !== "deleted"),
    [snapshots, showDeletedSnapshots],
  );
  const createdSnapshots = snapshots.filter((s) => s.status === "created");

  const totalSnapshotBytes = createdSnapshots.reduce(
    (sum, snap) => sum + (snap.sizeBytes ?? 0),
    0,
  );
  const runningSandboxes = sandboxes.filter((s) => s.status === "running").length;
  const activeSnapshotCount = createdSnapshots.length;
  const avgSnapshotBytes = activeSnapshotCount > 0
    ? Math.round(totalSnapshotBytes / activeSnapshotCount)
    : 0;
  const stoppableSelectedCount = selectedSandboxes.filter(
    (s) => s.status !== "stopped" && s.status !== "failed" && s.status !== "aborted",
  ).length;
  const deletableSelectedCount = selectedSnapshots.filter(
    (s) => s.status !== "deleted",
  ).length;

  useEffect(() => {
    const visibleIds = new Set(visibleSandboxes.map((s) => s.id));
    setSelectedSandboxes((prev) => prev.filter((s) => visibleIds.has(s.id)));
  }, [visibleSandboxes]);

  useEffect(() => {
    const visibleIds = new Set(visibleSnapshots.map((s) => s.id));
    setSelectedSnapshots((prev) => prev.filter((s) => visibleIds.has(s.id)));
  }, [visibleSnapshots]);

  const handleSandboxSelectionChange = useCallback((rows: SandboxListItem[]) => {
    setSelectedSandboxes((prev) => {
      if (prev.length === rows.length && prev.every((item, idx) => item.id === rows[idx]?.id)) {
        return prev;
      }
      return rows;
    });
  }, []);

  const handleSnapshotSelectionChange = useCallback((rows: SnapshotListItem[]) => {
    setSelectedSnapshots((prev) => {
      if (prev.length === rows.length && prev.every((item, idx) => item.id === rows[idx]?.id)) {
        return prev;
      }
      return rows;
    });
  }, []);

  async function stopSandbox(id: string) {
    setBusy(`stop:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/sandboxes/${id}/stop`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to stop sandbox");
      await mutateSandboxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop sandbox");
    } finally {
      setBusy(null);
    }
  }

  async function snapshotSandbox(id: string) {
    setBusy(`snapshot:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/sandboxes/${id}/snapshot`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to snapshot sandbox");
      await Promise.all([mutateSandboxes(), mutateSnapshots()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to snapshot sandbox");
    } finally {
      setBusy(null);
    }
  }

  async function inspectSandbox(id: string) {
    setBusy(`inspect-sandbox:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/sandboxes/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to fetch sandbox details");
      setInspectTitle(`Sandbox ${id}`);
      setInspectJson(JSON.stringify(body, null, 2));
      setInspectOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect sandbox");
    } finally {
      setBusy(null);
    }
  }

  async function inspectSnapshot(id: string) {
    setBusy(`inspect-snapshot:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/snapshots/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to fetch snapshot details");
      setInspectTitle(`Snapshot ${id}`);
      setInspectJson(JSON.stringify(body, null, 2));
      setInspectOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to inspect snapshot");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSnapshot(id: string) {
    setBusy(`delete:${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/vercel/snapshots/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to delete snapshot");
      await mutateSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete snapshot");
    } finally {
      setBusy(null);
    }
  }

  async function stopSelectedSandboxes() {
    if (selectedSandboxes.length === 0) return;
    setBusy("bulk-stop");
    setError(null);
    try {
      const stoppable = selectedSandboxes.filter(
        (s) => s.status !== "stopped" && s.status !== "failed" && s.status !== "aborted",
      );
      if (stoppable.length === 0) {
        setError("Selected sandboxes are already stopped/failed.");
        return;
      }
      const results = await Promise.allSettled(
        stoppable.map((s) =>
          fetch(`/api/vercel/sandboxes/${s.id}/stop`, { method: "POST" }),
        ),
      );
      const failures = results.filter(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
      ).length;
      if (failures > 0) {
        setError(`${failures} sandbox stop action(s) failed.`);
      }
      await mutateSandboxes();
      setSelectedSandboxes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop selected sandboxes");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSelectedSnapshots() {
    if (selectedSnapshots.length === 0) return;
    setBusy("bulk-delete");
    setError(null);
    try {
      const deletable = selectedSnapshots.filter((s) => s.status !== "deleted");
      if (deletable.length === 0) {
        setError("Selected snapshots are already deleted.");
        return;
      }
      const results = await Promise.allSettled(
        deletable.map((s) =>
          fetch(`/api/vercel/snapshots/${s.id}`, { method: "DELETE" }),
        ),
      );
      const failures = results.filter(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
      ).length;
      if (failures > 0) {
        setError(`${failures} snapshot delete action(s) failed.`);
      }
      await mutateSnapshots();
      setSelectedSnapshots([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete selected snapshots");
    } finally {
      setBusy(null);
    }
  }

  const sandboxColumns: ColumnDef<SandboxListItem>[] = [
    {
      accessorKey: "id",
      header: "Sandbox ID",
      cell: ({ row }) => (
        <code className="text-copy-12">{row.original.id}</code>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={SANDBOX_BADGE[row.original.status] ?? SANDBOX_BADGE.stopped}
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "sourceSnapshotId",
      header: "Source Snapshot",
      cell: ({ row }) => (
        <span className="text-copy-12 text-gray-700">
          {row.original.sourceSnapshotId ?? "-"}
        </span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => (
        <span className="text-copy-12 text-gray-700">
          {new Date(row.original.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => inspectSandbox(s.id)}
            >
              {busy === `inspect-sandbox:${s.id}` ? <Spinner className="size-3.5" /> : "Inspect"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() => snapshotSandbox(s.id)}
            >
              {busy === `snapshot:${s.id}` ? <Spinner className="size-3.5" /> : "Snapshot"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!!busy || s.status === "stopped" || s.status === "failed" || s.status === "aborted"}
              onClick={() => stopSandbox(s.id)}
            >
              {busy === `stop:${s.id}` ? <Spinner className="size-3.5" /> : "Stop"}
            </Button>
          </div>
        );
      },
    },
  ];

  const snapshotColumns: ColumnDef<SnapshotListItem>[] = [
    {
      accessorKey: "id",
      header: "Snapshot ID",
      cell: ({ row }) => (
        <code className="text-copy-12">{row.original.id}</code>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={SNAPSHOT_BADGE[row.original.status] ?? SNAPSHOT_BADGE.deleted}
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "sizeBytes",
      header: "Size",
      cell: ({ row }) => (
        <span className="text-copy-12 text-gray-700">
          {formatBytes(row.original.sizeBytes)}
        </span>
      ),
    },
    {
      accessorKey: "expiresAt",
      header: "Expires",
      cell: ({ row }) => (
        <span className="text-copy-12 text-gray-700">
          {new Date(row.original.expiresAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => inspectSnapshot(s.id)}
            >
              {busy === `inspect-snapshot:${s.id}` ? <Spinner className="size-3.5" /> : "Inspect"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!!busy || s.status === "deleted"}
              onClick={() => deleteSnapshot(s.id)}
            >
              {busy === `delete:${s.id}` ? <Spinner className="size-3.5" /> : "Delete"}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <main className="min-h-screen bg-background-100 p-6 sm:p-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <PageHeader
          title="Sandboxes"
          description="Directly manage Vercel sandboxes and snapshots."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary">
                <Link href="/desktop">Go to Desktop</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/profiles">Go to Profiles</Link>
              </Button>
            </div>
          }
        />

        {error ? <p className="text-copy-13 text-red-900">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-background-200">
            <CardHeader className="pb-2">
              <CardDescription>Total Snapshot Storage</CardDescription>
              <CardTitle>{formatBytes(totalSnapshotBytes)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-background-200">
            <CardHeader className="pb-2">
              <CardDescription>Snapshots (Created)</CardDescription>
              <CardTitle>{activeSnapshotCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-background-200">
            <CardHeader className="pb-2">
              <CardDescription>Sandboxes (Running)</CardDescription>
              <CardTitle>{runningSandboxes}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-background-200">
            <CardHeader className="pb-2">
              <CardDescription>Avg Snapshot Size</CardDescription>
              <CardTitle>{formatBytes(avgSnapshotBytes)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-background-200">
          <CardHeader>
            <CardTitle>Sandboxes</CardTitle>
            <CardDescription>
              {sandboxesLoading
                ? "Loading..."
                : `${visibleSandboxes.length} shown / ${sandboxes.length} total`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-copy-12 text-gray-800">
                <Switch
                  checked={showStoppedSandboxes}
                  onCheckedChange={setShowStoppedSandboxes}
                />
                Show stopped
              </label>
              <Button
                size="sm"
                variant="destructive"
                disabled={!!busy || stoppableSelectedCount === 0}
                onClick={() => void stopSelectedSandboxes()}
              >
                {busy === "bulk-stop" ? <Spinner className="size-3.5" /> : `Stop selected (${stoppableSelectedCount})`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void mutateSandboxes()}
              >
                Refresh
              </Button>
            </div>
            <MainDataTable
              columns={sandboxColumns}
              data={visibleSandboxes}
              filterColumnId="id"
              filterPlaceholder="Filter by sandbox ID..."
              getRowId={(row) => row.id}
              enableRowSelection
              onSelectionChange={handleSandboxSelectionChange}
            />
          </CardContent>
        </Card>

        <Card className="bg-background-200">
          <CardHeader>
            <CardTitle>Snapshots</CardTitle>
            <CardDescription>
              {snapshotsLoading
                ? "Loading..."
                : `${activeSnapshotCount} created / ${visibleSnapshots.length} shown / ${snapshots.length} listed · ${formatBytes(totalSnapshotBytes)} total`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="mr-2 flex items-center gap-2 text-copy-12 text-gray-800">
                <Switch
                  checked={showDeletedSnapshots}
                  onCheckedChange={setShowDeletedSnapshots}
                />
                Show deleted
              </label>
              <Button
                size="sm"
                variant="destructive"
                disabled={!!busy || deletableSelectedCount === 0}
                onClick={() => void deleteSelectedSnapshots()}
              >
                {busy === "bulk-delete" ? <Spinner className="size-3.5" /> : `Delete selected (${deletableSelectedCount})`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void mutateSnapshots()}
              >
                Refresh
              </Button>
            </div>
            <MainDataTable
              columns={snapshotColumns}
              data={visibleSnapshots}
              filterColumnId="id"
              filterPlaceholder="Filter by snapshot ID..."
              getRowId={(row) => row.id}
              enableRowSelection
              onSelectionChange={handleSnapshotSelectionChange}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={inspectOpen} onOpenChange={setInspectOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{inspectTitle}</DialogTitle>
            <DialogDescription>
              Raw API response.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-background p-3 text-copy-12">
            {inspectJson}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
