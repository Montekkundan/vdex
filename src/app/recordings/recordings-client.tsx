"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import useSWR from "swr";
import { MainDataTable } from "@/components/ui/main-data-table";
import { PageHeader } from "@/components/layout/page-header";
import { AppPageFooter } from "@/components/layout/app-page-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetcher } from "@/lib/swr";
import type { RecordingSummary } from "@/types/recording";

type RecordingsResponse = { recordings: RecordingSummary[] };

function formatDate(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "--";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function RecordingsClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<RecordingSummary[]>([]);

  const { data, isLoading, mutate } = useSWR<RecordingsResponse>(
    "/api/recordings",
    fetcher,
    {
      refreshInterval: 20_000,
      revalidateOnFocus: true,
    },
  );

  const recordings = useMemo(() => data?.recordings ?? [], [data]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const toggleVisibility = useCallback(
    async (row: RecordingSummary) => {
      setBusy(`visibility:${row.id}`);
      setError(null);
      try {
        const nextVisibility =
          row.visibility === "public" ? "private" : "public";
        const res = await fetch(`/api/recordings/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: nextVisibility }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Failed to update visibility");
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update visibility",
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const requestExport = useCallback(
    async (id: string) => {
      setBusy(`export:${id}`);
      setError(null);
      try {
        const res = await fetch(`/api/recordings/${id}/export-mp4`, {
          method: "POST",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Failed to queue MP4 export");
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to queue MP4 export",
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const deleteOne = useCallback(
    async (id: string) => {
      setBusy(`delete:${id}`);
      setError(null);
      try {
        const res = await fetch(`/api/recordings/${id}`, {
          method: "DELETE",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Failed to delete recording");
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete recording",
        );
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const deleteSelected = useCallback(async () => {
    if (selectedRows.length === 0) return;
    setBusy("bulk-delete");
    setError(null);
    try {
      const res = await fetch("/api/recordings/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedRows.map((row) => row.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to delete recordings");
      await refresh();
      setSelectedRows([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete recordings",
      );
    } finally {
      setBusy(null);
    }
  }, [refresh, selectedRows]);

  const exportSelected = useCallback(async () => {
    const readyToExport = selectedRows.filter(
      (row) => row.status === "completed",
    );
    if (readyToExport.length === 0) return;
    setBusy("bulk-export");
    setError(null);
    try {
      await Promise.all(
        readyToExport.map(async (row) => {
          const res = await fetch(`/api/recordings/${row.id}/export-mp4`, {
            method: "POST",
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              body.error || `Failed to queue export for ${row.id}`,
            );
          }
        }),
      );
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to queue selected exports",
      );
    } finally {
      setBusy(null);
    }
  }, [refresh, selectedRows]);

  const downloadSelected = useCallback(() => {
    const ready = selectedRows.filter((row) => row.mp4Status === "ready");
    ready.forEach((row) => {
      window.open(
        `/api/recordings/${row.id}/download`,
        "_blank",
        "noopener,noreferrer",
      );
    });
  }, [selectedRows]);

  const columns = useMemo<ColumnDef<RecordingSummary>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium text-gray-1000">
            {row.original.title || "Untitled"}
          </span>
        ),
      },
      {
        accessorKey: "mode",
        header: "Mode",
        cell: ({ row }) => <Badge variant="outline">{row.original.mode}</Badge>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "visibility",
        header: "Visibility",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.visibility}</Badge>
        ),
      },
      {
        accessorKey: "mp4Status",
        header: "MP4",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.mp4Status}</Badge>
        ),
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        cell: ({ row }) => (
          <span>{formatDuration(row.original.durationMs)}</span>
        ),
      },
      {
        accessorKey: "mp4SizeBytes",
        header: "Size",
        cell: ({ row }) => (
          <span>{formatBytes(row.original.mp4SizeBytes)}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => <span>{formatDate(row.original.createdAt)}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const item = row.original;
          const isBusy = busy?.includes(item.id) ?? false;
          const isReady = item.mp4Status === "ready";
          const isPublic = item.visibility === "public" && item.publicId;

          return (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/recording/${item.id}`}>Watch</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy || item.status !== "completed"}
                onClick={() => {
                  void requestExport(item.id);
                }}
              >
                {isBusy ? <Spinner className="size-3.5" /> : "Export MP4"}
              </Button>
              <Button asChild size="sm" disabled={!isReady}>
                <a href={`/api/recordings/${item.id}/download`}>Download</a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => {
                  void toggleVisibility(item);
                }}
              >
                {item.visibility === "public" ? "Make Private" : "Make Public"}
              </Button>
              {isPublic ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `${window.location.origin}/r/${item.publicId}`,
                    );
                  }}
                >
                  Copy Public Link
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => {
                  void deleteOne(item.id);
                }}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [busy, deleteOne, requestExport, toggleVisibility],
  );

  return (
    <main className="min-h-screen bg-background-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--container-max-width)] flex-col border-x border-dashed border-gray-alpha-300">
        <div className="flex-1 py-6 sm:py-8">
          <div className="space-y-6">
            <PageHeader
              title="Recordings"
              description="Manage private/public session recordings and MP4 exports."
              actions={
                <>
                  <Button asChild variant="secondary">
                    <Link href="/desktop">Desktop</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/profiles">Profiles</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/sandboxes">Sandboxes</Link>
                  </Button>
                </>
              }
            />

            {error ? (
              <div className="rounded-md border border-red-300 bg-red-100 px-4 py-3 text-copy-13 text-red-900">
                {error}
              </div>
            ) : null}

            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void exportSelected();
                    }}
                    disabled={
                      selectedRows.length === 0 || busy === "bulk-export"
                    }
                  >
                    {busy === "bulk-export" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      "Export Selected MP4"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={downloadSelected}
                    disabled={selectedRows.every(
                      (row) => row.mp4Status !== "ready",
                    )}
                  >
                    Download Selected MP4
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void deleteSelected();
                    }}
                    disabled={
                      selectedRows.length === 0 || busy === "bulk-delete"
                    }
                  >
                    {busy === "bulk-delete" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      "Delete Selected"
                    )}
                  </Button>
                  <span className="text-copy-12 text-gray-700">
                    {selectedRows.length} selected
                  </span>
                </div>

                {isLoading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Spinner size="md" />
                  </div>
                ) : (
                  <MainDataTable
                    columns={columns}
                    data={recordings}
                    filterColumnId="title"
                    filterPlaceholder="Filter recordings..."
                    enableRowSelection
                    onSelectionChange={setSelectedRows}
                    getRowId={(row) => row.id}
                    initialPageSize={20}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <AppPageFooter />
      </div>
    </main>
  );
}
