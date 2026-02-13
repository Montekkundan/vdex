"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutateWorkspaces, useWorkspaces } from "@/lib/hooks/use-swr-hooks";
import { DISPLAY_CLIENTS, PROVIDERS, SIZE_PROFILES } from "@/lib/runtime/profiles";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { slugify } from "@/lib/workspace-slug";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceIcon } from "@/components/workspace-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const restartWorkspace = useWorkspaceStore((s) => s.restartWorkspace);
  const stopWorkspace = useWorkspaceStore((s) => s.stopWorkspace);
  const killWorkspace = useWorkspaceStore((s) => s.killWorkspace);
  const creatingStatus = useWorkspaceStore((s) => s.creatingStatus);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceIcon, setNewWorkspaceIcon] = useState("terminal");
  const [newWorkspaceProvider, setNewWorkspaceProvider] = useState<ProviderId>("vercel");
  const [newWorkspaceDisplayClient, setNewWorkspaceDisplayClient] = useState<DisplayClient>("xpra");
  const [newWorkspaceSizeProfile, setNewWorkspaceSizeProfile] = useState<SizeProfileId>("balanced_4c8g");
  const [shutdownWorkspace, setShutdownWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [shutdownWithSnapshot, setShutdownWithSnapshot] = useState(false);
  const [shutdownWithoutSnapshot, setShutdownWithoutSnapshot] = useState(false);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const checkedRef = useRef<Set<string>>(new Set());

  const sorted = useMemo(
    () =>
      [...workspaces].sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (a.status !== "active" && b.status === "active") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [workspaces],
  );

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
    setNewWorkspaceDisplayClient("xpra");
    setNewWorkspaceSizeProfile("balanced_4c8g");
  }

  async function handleCreate() {
    setActionId("create");
    try {
      const ws = await createWorkspace({
        name: newWorkspaceName.trim() || undefined,
        icon: newWorkspaceIcon,
        provider: newWorkspaceProvider,
        displayClient: newWorkspaceDisplayClient,
        sizeProfile: newWorkspaceSizeProfile,
      });
      setCreateDialogOpen(false);
      resetCreateDialog();
      router.push(`/desktop/${encodeURIComponent(slugify(ws.name))}`);
    } finally {
      setActionId(null);
    }
  }

  async function handleOpen(id: string, name: string, status: string) {
    setActionId(id);
    setActionError(null);
    try {
      // Preflight check: an "active" DB row may still point to an expired/stopped sandbox.
      // /api/sandbox/[id] reconciles this and returns sandboxLost when dead.
      const probe = await fetch(`/api/sandbox/${id}`).catch(() => null);
      if (!probe || !probe.ok) {
        setActionError("Failed to verify sandbox status. Please try again.");
        await mutateWorkspaces();
        return;
      }
      const body = await probe.json().catch(() => ({}));
      if (body?.sandboxLost) {
        await mutateWorkspaces();
        setActionError("This VM is no longer running. Start it again from snapshot.");
        return;
      }

      if (status !== "active" || !body?.sandbox) {
        await restartWorkspace(id);
      }

      // Wait for display stack to be ready before navigating.
      const timeoutAt = Date.now() + 30_000;
      let ready = Boolean(body?.xpraReady && body?.servicesReady);
      while (!ready && Date.now() < timeoutAt) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const check = await fetch(`/api/sandbox/${id}`).catch(() => null);
        if (!check || !check.ok) continue;
        const next = await check.json().catch(() => ({}));
        if (next?.sandboxLost) {
          await mutateWorkspaces();
          setActionError("VM expired while starting. Try again.");
          return;
        }
        ready = Boolean(next?.xpraReady && next?.servicesReady);
      }

      if (!ready) {
        setActionError("VM is taking longer than expected to start display services. Try Open again.");
        return;
      }

      router.push(`/desktop/${encodeURIComponent(slugify(name))}`);
    } finally {
      setActionId(null);
    }
  }

  async function handleStop(id: string, createSnapshot: boolean) {
    setActionId(id);
    try {
      await stopWorkspace(id, { createSnapshot });
      setShutdownWorkspace(null);
    } finally {
      setActionId(null);
      setShutdownWithSnapshot(false);
      setShutdownWithoutSnapshot(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!deleteWorkspaceTarget) return;
    setDeletingWorkspace(true);
    setActionError(null);
    try {
      await killWorkspace(deleteWorkspaceTarget.id);
      setDeleteWorkspaceTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete workspace";
      setActionError(message);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-24 text-gray-1000">Workspaces</h1>
            <p className="text-copy-13 text-gray-700">
              Create, switch, and manage your VMs.
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            disabled={!!creatingStatus || actionId === "create"}
          >
            New VM
          </Button>
        </div>

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((ws) => {
                    const busy = actionId === ws.id;
                    return (
                      <TableRow key={ws.id}>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={STATUS_STYLE[ws.status] ?? STATUS_STYLE.stopped}
                          >
                            {ws.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-copy-12 text-gray-700">
                          {new Date(ws.updatedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
              Configure provider, display client, and size profile.
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
              <Select
                value={newWorkspaceProvider}
                onValueChange={(value) => setNewWorkspaceProvider(value as ProviderId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PROVIDERS).map((provider) => (
                    <SelectItem
                      key={provider.id}
                      value={provider.id}
                      disabled={!provider.enabled}
                    >
                      {provider.label}
                      {!provider.enabled && provider.reason
                        ? ` (Unavailable: ${provider.reason})`
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
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select display client" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DISPLAY_CLIENTS).map((client) => (
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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={actionId === "create"}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!!creatingStatus || actionId === "create"}
            >
              {actionId === "create" ? <Spinner className="size-3.5" /> : "Create VM"}
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
