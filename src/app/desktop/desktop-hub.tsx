"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { mutateWorkspaces, useSnapshots, useWorkspaces } from "@/lib/hooks/use-swr-hooks";
import { DISPLAY_CLIENTS, EXPERIENCES, SIZE_PROFILES } from "@/lib/runtime/profiles";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { slugify } from "@/lib/workspace-slug";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MainDataTable } from "@/components/ui/main-data-table";
import { captureEvent } from "@/lib/observability/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type DisplayClient,
  type ProviderId,
  type SizeProfileId,
  type WorkspaceExperience,
  WORKSPACE_ICON_NAMES,
} from "@/types/workspace";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-900 border border-green-300",
  stopped: "bg-gray-alpha-100 text-gray-900 border border-gray-alpha-300",
  creating: "bg-blue-100 text-blue-900 border border-blue-300",
  snapshotted: "bg-purple-100 text-purple-900 border border-purple-300",
  error: "bg-red-100 text-red-900 border border-red-300",
};

export function DesktopHub() {
  const router = useRouter();
  const { workspaces, isLoading } = useWorkspaces(true);
  const { snapshots } = useSnapshots(true);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const restartWorkspace = useWorkspaceStore((s) => s.restartWorkspace);
  const stopWorkspace = useWorkspaceStore((s) => s.stopWorkspace);
  const killWorkspace = useWorkspaceStore((s) => s.killWorkspace);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceIcon, setNewWorkspaceIcon] = useState("terminal");
  const [newWorkspaceProvider, setNewWorkspaceProvider] = useState<ProviderId>("vercel");
  const [newWorkspaceExperience, setNewWorkspaceExperience] = useState<WorkspaceExperience>("gui");
  const [newWorkspaceDisplayClient, setNewWorkspaceDisplayClient] = useState<DisplayClient>("xpra");
  const [newWorkspaceSizeProfile, setNewWorkspaceSizeProfile] = useState<SizeProfileId>("balanced_4c8g");
  const [newWorkspaceSnapshotSource, setNewWorkspaceSnapshotSource] = useState<
    "platform_default" | "user_snapshot"
  >("platform_default");
  const [newWorkspaceSnapshotRefId, setNewWorkspaceSnapshotRefId] = useState("");
  const [shutdownWorkspace, setShutdownWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [shutdownWithSnapshot, setShutdownWithSnapshot] = useState(false);
  const [shutdownWithoutSnapshot, setShutdownWithoutSnapshot] = useState(false);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [pendingCreates, setPendingCreates] = useState<Array<{
    id: string;
    workspace: (typeof workspaces)[number];
  }>>([]);
  const pendingCreateSeqRef = useRef(0);
  const checkedRef = useRef<Set<string>>(new Set());
  const compatibleSnapshots = useMemo(
    () =>
      snapshots.filter(
        (s) =>
          s.status === "ready" &&
          s.provider === newWorkspaceProvider &&
          s.experience === newWorkspaceExperience &&
          (s.displayClient ?? "none") ===
            (newWorkspaceExperience === "cli" ? "none" : newWorkspaceDisplayClient) &&
          s.sizeProfile === newWorkspaceSizeProfile,
      ),
    [
      snapshots,
      newWorkspaceProvider,
      newWorkspaceExperience,
      newWorkspaceDisplayClient,
      newWorkspaceSizeProfile,
    ],
  );

  const mergedWorkspaces = useMemo(
    () => [
      ...pendingCreates.map((entry) => entry.workspace),
      ...workspaces,
    ],
    [pendingCreates, workspaces],
  );
  const sorted = useMemo(
    () =>
      [...mergedWorkspaces].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (a.status !== "active" && b.status === "active") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [mergedWorkspaces],
  );
  const instanceColumns: ColumnDef<(typeof sorted)[number]>[] = [
      {
        accessorKey: "name",
        header: "Workspace",
        cell: ({ row }) => {
          const ws = row.original;
          return (
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-alpha-200">
                <WorkspaceIcon name={ws.icon} size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-copy-14 font-medium text-gray-1000">
                  {ws.name}
                </p>
                <p className="text-copy-12 text-gray-700">{ws.id}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={STATUS_STYLE[row.original.status] ?? STATUS_STYLE.stopped}
          >
            {row.original.status}
          </Badge>
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
          const ws = row.original;
          const busy = actionId === ws.id;
          return (
            <div className="flex justify-end gap-2">
              {ws.status === "active" ? (
                <Button
                  size="sm"
                  onClick={() => handleOpen(ws.id, ws.name, ws.status)}
                  disabled={busy}
                >
                  {busy ? <Spinner className="size-3.5" /> : "Open"}
                </Button>
              ) : ws.snapshotId ? (
                <Button
                  size="sm"
                  onClick={() => handleOpen(ws.id, ws.name, ws.status)}
                  disabled={busy}
                >
                  {busy ? <Spinner className="size-3.5" /> : "Start"}
                </Button>
              ) : (
                <Badge variant="outline">No snapshot</Badge>
              )}
              {ws.status === "active" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShutdownWorkspace({ id: ws.id, name: ws.name })}
                  disabled={busy}
                >
                  Shutdown
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setDeleteWorkspaceTarget({
                    id: ws.id,
                    name: ws.name,
                  })
                }
                disabled={busy}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ];

  // Reconcile stale "active" DB rows against live sandbox state.
  // /api/sandbox/[id] will mark dead sandboxes as stopped server-side.
  useEffect(() => {
    const activeIds = new Set(workspaces.filter((w) => w.status === "active").map((w) => w.id));
    for (const id of Array.from(checkedRef.current)) {
      if (!activeIds.has(id)) checkedRef.current.delete(id);
    }

    const activeToCheck = workspaces.filter(
      (w) => w.status === "active" && w.sandboxId && !checkedRef.current.has(w.id),
    );
    if (activeToCheck.length === 0) return;

    for (const w of activeToCheck) checkedRef.current.add(w.id);

    void Promise.all(
      activeToCheck.map(async (w) => {
        try {
          const res = await fetch(`/api/sandbox/${w.id}`);
          if (!res.ok) return;
          const body = await res.json();
          if (body?.sandboxLost) {
            useWorkspaceStore.getState().markSandboxLost(w.id);
            await mutateWorkspaces();
          }
        } catch {
          // keep current state on transient network issues
        }
      }),
    );
  }, [workspaces]);

  function resetCreateDialog() {
    setNewWorkspaceName("");
    setNewWorkspaceIcon("terminal");
    setNewWorkspaceProvider("vercel");
    setNewWorkspaceExperience("gui");
    setNewWorkspaceDisplayClient("xpra");
    setNewWorkspaceSizeProfile("balanced_4c8g");
    setNewWorkspaceSnapshotSource("platform_default");
    setNewWorkspaceSnapshotRefId("");
  }

  async function handleCreate() {
    const startedAt = Date.now();
    const payload = {
      name: newWorkspaceName.trim() || undefined,
      icon: newWorkspaceIcon,
      provider: newWorkspaceProvider,
      experience: newWorkspaceExperience,
      displayClient: newWorkspaceExperience === "gui" ? newWorkspaceDisplayClient : "none",
      sizeProfile: newWorkspaceSizeProfile,
      snapshotSource: newWorkspaceSnapshotSource,
      snapshotRefId:
        newWorkspaceSnapshotSource === "user_snapshot"
          ? newWorkspaceSnapshotRefId || undefined
          : undefined,
    } as const;
    captureEvent("workspace_create_requested", payload);

    pendingCreateSeqRef.current += 1;
    const pendingId = `pending-${Date.now()}-${pendingCreateSeqRef.current}`;
    const nowIso = new Date().toISOString();
    const pendingWorkspace = {
      id: pendingId,
      name: payload.name ?? `starting-vm-${pendingCreateSeqRef.current}`,
      icon: payload.icon,
      sandboxId: null,
      snapshotId: null,
      provider: payload.provider,
      experience: payload.experience,
      displayClient: payload.displayClient,
      sizeProfile: payload.sizeProfile,
      status: "creating" as const,
      sandboxDomain: null,
      background: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setPendingCreates((prev) => [{ id: pendingId, workspace: pendingWorkspace }, ...prev]);
    setCreateDialogOpen(false);
    resetCreateDialog();
    setActionError(null);

    void createWorkspace(payload)
      .then((workspace) => {
        captureEvent("workspace_create_succeeded", {
          workspaceId: workspace.id,
          provider: workspace.provider,
          experience: workspace.experience,
          displayClient: workspace.displayClient,
          sizeProfile: workspace.sizeProfile,
          status: workspace.status,
          latencyMs: Date.now() - startedAt,
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to create workspace";
        setActionError(message);
        captureEvent("workspace_create_failed", {
          ...payload,
          errorCode: "create_failed",
          errorMessage: message,
          latencyMs: Date.now() - startedAt,
        });
      })
      .finally(() => {
        setPendingCreates((prev) => prev.filter((entry) => entry.id !== pendingId));
      });
  }

  async function handleOpen(id: string, name: string, status: string) {
    const startedAt = Date.now();
    const workspace = workspaces.find((w) => w.id === id);
    const meta = {
      workspaceId: id,
      provider: workspace?.provider ?? "unknown",
      experience: workspace?.experience ?? "unknown",
      displayClient: workspace?.displayClient ?? "unknown",
      sizeProfile: workspace?.sizeProfile ?? "unknown",
      status,
    };
    captureEvent("workspace_open_requested", meta);
    setActionId(id);
    setActionError(null);
    try {
      // Preflight check: an "active" DB row may still point to an expired/stopped sandbox.
      // /api/sandbox/[id] reconciles this and returns sandboxLost when dead.
      const probe = await fetch(`/api/sandbox/${id}`).catch(() => null);
      if (!probe || !probe.ok) {
        setActionError("Failed to verify sandbox status. Please try again.");
        await mutateWorkspaces();
        captureEvent("workspace_open_failed", {
          ...meta,
          errorCode: "preflight_failed",
          latencyMs: Date.now() - startedAt,
        });
        return;
      }
      const body = await probe.json().catch(() => ({}));
      if (body?.sandboxLost) {
        await mutateWorkspaces();
        setActionError("This VM is no longer running. Start it again from snapshot.");
        captureEvent("workspace_open_failed", {
          ...meta,
          errorCode: "sandbox_lost_preflight",
          latencyMs: Date.now() - startedAt,
        });
        return;
      }

      if (status !== "active" || !body?.sandbox) {
        await restartWorkspace(id);
      }

      // Wait for display stack to be ready before navigating.
      const timeoutAt = Date.now() + 30_000;
      let ready = Boolean(body?.displayReady && body?.servicesReady);
      while (!ready && Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const check = await fetch(`/api/sandbox/${id}`).catch(() => null);
        if (!check || !check.ok) continue;
        const next = await check.json().catch(() => ({}));
        if (next?.sandboxLost) {
          await mutateWorkspaces();
          setActionError("VM expired while starting. Try again.");
          captureEvent("workspace_open_failed", {
            ...meta,
            errorCode: "sandbox_lost_startup",
            latencyMs: Date.now() - startedAt,
          });
          return;
        }
        ready = Boolean(next?.displayReady && next?.servicesReady);
      }

      if (!ready) {
        setActionError("VM is taking longer than expected to start display services. Try Open again.");
        captureEvent("workspace_open_failed", {
          ...meta,
          errorCode: "display_timeout",
          latencyMs: Date.now() - startedAt,
        });
        return;
      }

      captureEvent("workspace_open_ready", {
        ...meta,
        latencyMs: Date.now() - startedAt,
      });
      router.push(`/desktop/${encodeURIComponent(slugify(name))}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to open workspace");
      captureEvent("workspace_open_failed", {
        ...meta,
        errorCode: "open_failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      setActionId(null);
    }
  }

  async function handleStop(id: string, createSnapshot: boolean) {
    const startedAt = Date.now();
    const workspace = workspaces.find((w) => w.id === id);
    const meta = {
      workspaceId: id,
      provider: workspace?.provider ?? "unknown",
      experience: workspace?.experience ?? "unknown",
      displayClient: workspace?.displayClient ?? "unknown",
      sizeProfile: workspace?.sizeProfile ?? "unknown",
      status: workspace?.status ?? "unknown",
      createSnapshot,
    };
    captureEvent("workspace_shutdown_requested", meta);
    setActionId(id);
    try {
      await stopWorkspace(id, { createSnapshot });
      captureEvent("workspace_shutdown_succeeded", {
        ...meta,
        latencyMs: Date.now() - startedAt,
      });
      setShutdownWorkspace(null);
    } catch (err) {
      captureEvent("workspace_shutdown_failed", {
        ...meta,
        errorCode: "shutdown_failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        latencyMs: Date.now() - startedAt,
      });
      setActionError(err instanceof Error ? err.message : "Failed to shutdown workspace");
    } finally {
      setActionId(null);
      setShutdownWithSnapshot(false);
      setShutdownWithoutSnapshot(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!deleteWorkspaceTarget) return;
    const startedAt = Date.now();
    const workspace = workspaces.find((w) => w.id === deleteWorkspaceTarget.id);
    const meta = {
      workspaceId: deleteWorkspaceTarget.id,
      provider: workspace?.provider ?? "unknown",
      experience: workspace?.experience ?? "unknown",
      displayClient: workspace?.displayClient ?? "unknown",
      sizeProfile: workspace?.sizeProfile ?? "unknown",
      status: workspace?.status ?? "unknown",
    };
    captureEvent("workspace_delete_requested", meta);
    setDeletingWorkspace(true);
    setActionError(null);
    try {
      await killWorkspace(deleteWorkspaceTarget.id);
      captureEvent("workspace_delete_succeeded", {
        ...meta,
        latencyMs: Date.now() - startedAt,
      });
      setDeleteWorkspaceTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete workspace";
      setActionError(message);
      captureEvent("workspace_delete_failed", {
        ...meta,
        errorCode: "delete_failed",
        errorMessage: message,
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      setDeletingWorkspace(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background-100">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background-100 p-6 sm:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <PageHeader
          title="Workspaces"
          description="Create, switch, and manage your VMs."
          actions={
            <>
            <Button asChild variant="secondary">
              <Link href="/profiles">Profiles</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/sandboxes">Sandboxes</Link>
            </Button>
            <Button
              onClick={() => setCreateDialogOpen(true)}
            >
              New VM
            </Button>
            </>
          }
        />

        <Card className="bg-background-200">
          <CardHeader>
            <CardTitle>Instances</CardTitle>
            <CardDescription>Launch and switch VMs instantly.</CardDescription>
          </CardHeader>
          <CardContent>
            {actionError && (
              <p className="mb-3 text-copy-13 text-red-900">{actionError}</p>
            )}
            {sorted.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-copy-14 text-gray-900">No workspaces yet.</p>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  Create first VM
                </Button>
              </div>
            ) : (
              <MainDataTable
                columns={instanceColumns}
                data={sorted}
                filterColumnId="name"
                filterPlaceholder="Filter workspaces..."
                getRowId={(row) => row.id}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetCreateDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create VM</DialogTitle>
            <DialogDescription>
              Configure display client and size profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Name (optional)</label>
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="auto-generated"
                maxLength={64}
              />
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Icon</label>
              <Select
                value={newWorkspaceIcon}
                onValueChange={(value) => setNewWorkspaceIcon(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select icon" />
                </SelectTrigger>
                <SelectContent>
                  {WORKSPACE_ICON_NAMES.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Provider</label>
              <Select value={newWorkspaceProvider} disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vercel">Vercel Sandbox</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Experience</label>
              <Select
                value={newWorkspaceExperience}
                onValueChange={(value) =>
                  setNewWorkspaceExperience(value as WorkspaceExperience)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select experience" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(EXPERIENCES).map((experience) => (
                    <SelectItem
                      key={experience.id}
                      value={experience.id}
                      disabled={!experience.enabled}
                    >
                      {experience.label}
                      {!experience.enabled && experience.reason
                        ? ` (Unavailable: ${experience.reason})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Display client</label>
              <Select
                value={newWorkspaceDisplayClient}
                onValueChange={(value) =>
                  setNewWorkspaceDisplayClient(value as DisplayClient)
                }
                disabled={newWorkspaceExperience !== "gui"}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select display client" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DISPLAY_CLIENTS)
                    .filter((client) => client.id !== "none")
                    .map((client) => (
                    <SelectItem
                      key={client.id}
                      value={client.id}
                      disabled={!client.enabled}
                    >
                      {client.label}
                      {!client.enabled && client.reason
                        ? ` (Unavailable: ${client.reason})`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Size profile</label>
              <Select
                value={newWorkspaceSizeProfile}
                onValueChange={(value) =>
                  setNewWorkspaceSizeProfile(value as SizeProfileId)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select size profile" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SIZE_PROFILES).map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-copy-12 text-gray-800">Snapshot source</label>
              <Select
                value={newWorkspaceSnapshotSource}
                onValueChange={(value) =>
                  setNewWorkspaceSnapshotSource(value as "platform_default" | "user_snapshot")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_default">Platform default</SelectItem>
                  <SelectItem value="user_snapshot">My snapshot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newWorkspaceSnapshotSource === "user_snapshot" ? (
              <div className="space-y-1">
                <label className="text-copy-12 text-gray-800">My snapshot</label>
                <Select
                  value={newWorkspaceSnapshotRefId}
                  onValueChange={(value) => setNewWorkspaceSnapshotRefId(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select snapshot" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleSnapshots.map((snapshot) => (
                      <SelectItem key={snapshot.id} value={snapshot.id}>
                        {snapshot.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                (newWorkspaceSnapshotSource === "user_snapshot" &&
                  !newWorkspaceSnapshotRefId)
              }
            >
              Create VM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!shutdownWorkspace}
        onOpenChange={(open) => {
          if (!open) {
            setShutdownWorkspace(null);
            setShutdownWithSnapshot(false);
            setShutdownWithoutSnapshot(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Shutdown VM</AlertDialogTitle>
            <AlertDialogDescription>
              Choose whether to save a snapshot before shutdown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-end">
            <AlertDialogCancel disabled={shutdownWithSnapshot || shutdownWithoutSnapshot}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={!shutdownWorkspace || shutdownWithSnapshot || shutdownWithoutSnapshot}
              onClick={(e) => {
                e.preventDefault();
                if (!shutdownWorkspace) return;
                setShutdownWithoutSnapshot(true);
                void handleStop(shutdownWorkspace.id, false);
              }}
            >
              {shutdownWithoutSnapshot ? <Spinner className="size-3.5" /> : "Without Snapshot"}
            </AlertDialogAction>
            <AlertDialogAction
              disabled={!shutdownWorkspace || shutdownWithSnapshot || shutdownWithoutSnapshot}
              onClick={(e) => {
                e.preventDefault();
                if (!shutdownWorkspace) return;
                setShutdownWithSnapshot(true);
                void handleStop(shutdownWorkspace.id, true);
              }}
            >
              {shutdownWithSnapshot ? <Spinner className="size-3.5" /> : "With Snapshot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteWorkspaceTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteWorkspaceTarget(null);
            setDeletingWorkspace(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deleteWorkspaceTarget?.name}&quot; permanently? This removes
              the workspace from your account and stops its sandbox if running.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingWorkspace}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!deleteWorkspaceTarget || deletingWorkspace}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteWorkspace();
              }}
            >
              {deletingWorkspace ? (
                <Spinner className="size-3.5" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
