"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWindowStore, flushWindowSync } from "@/stores/window-store";
import { useDesktopStore } from "@/stores/desktop-store";
import { Desktop } from "@/components/desktop/Desktop";
import { DesktopBackground } from "@/components/desktop/DesktopBackground";
import { WindowRenderer } from "@/components/desktop/WindowRenderer";
import { Taskbar } from "@/components/taskbar/Taskbar";
import { XpraConnector } from "@/components/apps/xpra-window/XpraConnector";
import {
  RemoteDisplayClient,
  UnsupportedDisplayClientNote,
} from "@/components/display/RemoteDisplayClient";
import { NotificationToasts } from "@/components/notifications/NotificationToasts";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useSyncSandboxTheme } from "@/lib/hooks/use-sync-sandbox-theme";
import { useSandboxHeartbeat } from "@/lib/hooks/use-sandbox-heartbeat";
import {
  useDbusNotifications,
  useDesktopEntryMonitor,
} from "@/lib/hooks/use-sandbox-bridge";
import {
  useWorkspaces,
  useWorkspace,
  useWindowState,
  mutateWorkspaces,
} from "@/lib/hooks/use-swr-hooks";
import { Spinner } from "@/components/ui/spinner";
import { Note } from "@/components/ui/note";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/workspace-slug";
import { useGlobalKeybinds } from "@/lib/keyboard/use-global-keybinds";
import { WindowSwitcher } from "@/components/desktop/WindowSwitcher";
import type { SandboxInfo } from "@/types/sandbox";
import { TerminalApp } from "@/components/apps/terminal/TerminalApp";
import { reportDesktopError } from "@/lib/desktop/report-error";
import { Settings2, Share2 } from "lucide-react";
import { TerminalSettingsDialog } from "@/components/apps/terminal/TerminalSettingsDialog";
import {
  DEFAULT_TERMINAL_SETTINGS,
  loadSandboxTerminalSettings,
  saveSandboxTerminalSettings,
  type TerminalSettings,
} from "@/lib/terminal/config";

interface DesktopShellProps {
  user: { id: string; email: string | null; name: string | null };
  /** If set, resolve this slug (workspace name or ID) and auto-select it */
  targetSlug?: string;
  /** If true, this shell is mounted on /desktop/[slug] and should return to hub on failures */
  strictTargetRoute?: boolean;
}

// ---------------------------------------------------------------------------
// WorkspaceStatusToast (unchanged)
// ---------------------------------------------------------------------------

function WorkspaceStatusToast() {
  const creatingStatus = useWorkspaceStore((s) => s.creatingStatus);
  const creatingError = useWorkspaceStore((s) => s.creatingError);
  const reconnectWorkspace = useWorkspaceStore((s) => s.reconnectWorkspace);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );
  const activeSandbox = useWorkspaceStore((s) =>
    s.activeWorkspaceId ? s.sandboxes[s.activeWorkspaceId] : null,
  );

  const isCreating = activeWorkspace?.status === "creating";
  const isWaitingForSandbox =
    activeWorkspace?.status === "active" && !activeSandbox;

  if (!creatingStatus && !creatingError && !isCreating && !isWaitingForSandbox)
    return null;

  let message: string;
  let detail: string | null = null;
  const isError = !!creatingError && !creatingStatus;

  if (isError) {
    message = "Failed to connect to workspace";
    detail = creatingError;
  } else if (creatingStatus) {
    message = "Setting up workspace";
    detail = creatingStatus;
  } else if (isCreating) {
    message = "Workspace is starting up";
    detail = `"${activeWorkspace.name}" is being provisioned...`;
  } else {
    message = "Connecting to workspace";
    detail = "Waiting for sandbox to become available...";
  }

  return (
    <div className="fixed bottom-14 left-1/2 z-9999 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
      <div
        className={`flex items-center gap-3 rounded-xl border px-5 py-3 backdrop-blur-md ${isError ? "border-red-500/30" : "border-gray-alpha-200"}`}
        style={{
          boxShadow: "var(--ds-shadow-modal)",
          background: "var(--ds-background-200)",
        }}
        role="status"
      >
        {!isError && <Spinner size="sm" />}
        <div>
          <p
            className={`text-label-13 ${isError ? "text-red-900" : "text-gray-1000"}`}
          >
            {message}
          </p>
          {detail && <p className="text-label-12 text-gray-900">{detail}</p>}
        </div>
        {isError && activeWorkspaceId && (
          <button
            className="ml-2 rounded-md bg-gray-1000 px-3 py-1 text-label-12 text-gray-100 transition-opacity hover:opacity-90"
            onClick={() => {
              reconnectWorkspace(activeWorkspaceId).catch(() => {});
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DesktopShell
// ---------------------------------------------------------------------------

function useDocumentTitle() {
  const name = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
    return ws?.name ?? null;
  });

  useEffect(() => {
    document.title = name ? `${name} \u2014 vdex` : "vdex";
  }, [name]);
}

/** Sync the URL to /desktop/<slug> when the active workspace changes. */
function useUrlSync(enabled = true) {
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );

  useEffect(() => {
    if (!enabled) return;
    if (!activeWorkspace) return;
    const slug = slugify(activeWorkspace.name);
    if (!slug) return;
    const target = `/desktop/${encodeURIComponent(slug)}`;
    if (window.location.pathname !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [activeWorkspace]);
}

export function DesktopShell({
  user,
  targetSlug,
  strictTargetRoute = false,
}: DesktopShellProps) {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeWorkspaceFromStore = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  );
  const activeWorkspaceDisplayClient =
    activeWorkspaceFromStore?.displayClient ?? "xpra";
  const activeWorkspaceExperience =
    activeWorkspaceFromStore?.experience ?? "gui";
  const showRemoteDisplay =
    activeWorkspaceExperience === "gui" &&
    (activeWorkspaceDisplayClient === "novnc" ||
      activeWorkspaceDisplayClient === "vnc" ||
      activeWorkspaceDisplayClient === "kasmvnc" ||
      activeWorkspaceDisplayClient === "rdp" ||
      activeWorkspaceDisplayClient === "webrtc");
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setSandboxInfo = useWorkspaceStore((s) => s.setSandboxInfo);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const stopWorkspace = useWorkspaceStore((s) => s.stopWorkspace);
  const sandboxes = useWorkspaceStore((s) => s.sandboxes);

  useDocumentTitle();
  useUrlSync(!strictTargetRoute);
  useSyncSandboxTheme();
  useSandboxHeartbeat();
  useDbusNotifications();
  useDesktopEntryMonitor();
  const { switcher, launcherToggle } = useGlobalKeybinds();

  // ---- SWR: workspace list ----
  const { workspaces, isLoading: workspacesLoading } = useWorkspaces(!!user);

  // Sync SWR workspace data into Zustand store so existing consumers work.
  // Always push -- including empty lists -- so that remotely-deleted workspaces
  // are pruned from Zustand (setWorkspaces handles active-id reconciliation).
  useEffect(() => {
    setWorkspaces(workspaces);
  }, [workspaces, setWorkspaces]);

  // ---- SWR: active workspace sandbox info ----
  const {
    sandbox: activeSandbox,
    sandboxLost,
    canRecover,
    isLoading: activeWorkspaceLoading,
  } = useWorkspace(activeWorkspaceId);
  const reconnectWorkspace = useWorkspaceStore((s) => s.reconnectWorkspace);
  const creatingStatus = useWorkspaceStore((s) => s.creatingStatus);

  // Sync active sandbox info into Zustand store
  useEffect(() => {
    if (activeWorkspaceId && activeSandbox) {
      setSandboxInfo(activeWorkspaceId, activeSandbox);
    }
  }, [activeWorkspaceId, activeSandbox, setSandboxInfo]);

  // When sandbox is lost for the active workspace, update Zustand immediately
  // so the switcher shows a red dot and bridge hooks stop polling
  useEffect(() => {
    if (!activeWorkspaceId || !sandboxLost) return;
    useWorkspaceStore.getState().markSandboxLost(activeWorkspaceId);
  }, [activeWorkspaceId, sandboxLost]);

  // Auto-reconnect when sandbox is detected as dead (up to 3 attempts with backoff)
  const reconnectAttemptsRef = useRef<Record<string, number>>({});
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Reset reconnect attempt counter when sandbox comes back (reconnect succeeded)
  useEffect(() => {
    if (activeWorkspaceId && activeSandbox && !sandboxLost) {
      delete reconnectAttemptsRef.current[activeWorkspaceId];
    }
  }, [activeWorkspaceId, activeSandbox, sandboxLost]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (strictTargetRoute) return;
    if (!activeWorkspaceId || !sandboxLost || creatingStatus) return;

    const attempts = reconnectAttemptsRef.current[activeWorkspaceId] ?? 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) return;

    reconnectAttemptsRef.current[activeWorkspaceId] = attempts + 1;
    const delay = attempts === 0 ? 0 : Math.pow(2, attempts - 1) * 3000; // 0s, 3s, 6s

    console.log(
      `[desktop] Sandbox lost for workspace ${activeWorkspaceId}.` +
        ` Auto-reconnect attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS}` +
        `${delay ? ` (after ${delay / 1000}s)` : ""}` +
        ` ${canRecover ? "from snapshot" : "(fresh)"}`,
    );

    if (delay === 0) {
      reconnectWorkspace(activeWorkspaceId);
    } else {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectWorkspace(activeWorkspaceId);
      }, delay);
    }
  }, [
    activeWorkspaceId,
    sandboxLost,
    canRecover,
    creatingStatus,
    reconnectWorkspace,
    strictTargetRoute,
  ]);

  // ---- Fetch desktop entries when sandbox becomes available ----
  const servicesDomain = activeSandbox?.domains?.services ?? null;
  const fetchedServicesRef = useRef<string | null>(null);
  useEffect(() => {
    if (!servicesDomain || fetchedServicesRef.current === servicesDomain)
      return;
    fetchedServicesRef.current = servicesDomain;
    useDesktopStore
      .getState()
      .fetchRemoteApps(activeWorkspaceId, servicesDomain);
  }, [activeWorkspaceId, servicesDomain]);

  // ---- SWR: window state for active workspace ----
  const { windows: windowStateData } = useWindowState(activeWorkspaceId);

  // ---- Bootstrap: auto-select workspace + auto-create if empty ----
  const MAX_RETRIES = 3;
  const bootstrappedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const attemptCreateWorkspace = useCallback(() => {
    const runAttempt = () => {
      createWorkspace().catch((err) => {
        console.error(
          `Auto-create workspace failed (attempt ${retryCountRef.current + 1}/${MAX_RETRIES + 1}):`,
          err,
        );
        retryCountRef.current += 1;
        if (retryCountRef.current <= MAX_RETRIES) {
          const delay = Math.pow(2, retryCountRef.current - 1) * 1000;
          retryTimerRef.current = setTimeout(runAttempt, delay);
        }
      });
    };
    runAttempt();
  }, [createWorkspace]);

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const [returningToHub, setReturningToHub] = useState(false);
  const [shutdownDialogOpen, setShutdownDialogOpen] = useState(false);
  const [shutdownWithSnapshot, setShutdownWithSnapshot] = useState(false);
  const [shutdownWithoutSnapshot, setShutdownWithoutSnapshot] = useState(false);
  const [sharingWorkspace, setSharingWorkspace] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopying, setShareCopying] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [cliSettingsOpen, setCliSettingsOpen] = useState(false);
  const [cliSettingsVersion, setCliSettingsVersion] = useState(0);
  const cliActiveSandboxId =
    activeWorkspaceId ? sandboxes[activeWorkspaceId]?.sandboxId ?? null : null;
  const cliPreviewUrl = activeSandbox?.domains?.preview
    ? `https://${activeSandbox.domains.preview}`
    : null;
  const cliPreviewHost = cliPreviewUrl ? activeSandbox?.domains?.preview : null;
  const cliTerminalSettings = useMemo<TerminalSettings>(() => {
    // Force refresh after explicit save/reset operations.
    void cliSettingsVersion;
    if (activeWorkspaceExperience !== "cli") return DEFAULT_TERMINAL_SETTINGS;
    if (!cliActiveSandboxId) return DEFAULT_TERMINAL_SETTINGS;
    return loadSandboxTerminalSettings(cliActiveSandboxId);
  }, [activeWorkspaceExperience, cliActiveSandboxId, cliSettingsVersion]);
  const slugError = useMemo(() => {
    if (strictTargetRoute || !targetSlug || workspacesLoading) return null;
    const decoded = decodeURIComponent(targetSlug);
    const match = workspaces.find(
      (w) => slugify(w.name) === slugify(decoded) || w.id === decoded,
    );
    if (match) return null;
    return `Workspace "${decoded}" not found.`;
  }, [strictTargetRoute, targetSlug, workspacesLoading, workspaces]);
  const strictTargetWorkspace = useMemo(() => {
    if (!strictTargetRoute || !targetSlug || workspacesLoading) return null;
    const decoded = decodeURIComponent(targetSlug);
    return (
      workspaces.find(
        (w) => slugify(w.name) === slugify(decoded) || w.id === decoded,
      ) ?? null
    );
  }, [strictTargetRoute, targetSlug, workspacesLoading, workspaces]);
  const waitingForStrictTarget =
    strictTargetRoute &&
    !!targetSlug &&
    (workspacesLoading ||
      (!!strictTargetWorkspace &&
        activeWorkspaceId !== strictTargetWorkspace.id));

  useEffect(() => {
    if (workspacesLoading || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    if (workspaces.length === 0) {
      retryCountRef.current = 0;
      attemptCreateWorkspace();
      return;
    }

    // If a target slug was provided via URL, resolve it
    if (targetSlug) {
      const decoded = decodeURIComponent(targetSlug);
      const match = workspaces.find(
        (w) => slugify(w.name) === slugify(decoded) || w.id === decoded,
      );
      if (match) {
        setActiveWorkspace(match.id);
        return;
      }
      // Not found in user's workspaces
      if (strictTargetRoute) {
        router.replace("/desktop");
        return;
      }
      return;
    }

    // Auto-select workspace: prefer last-used from localStorage, then first active
    const currentActive = useWorkspaceStore.getState().activeWorkspaceId;
    if (!currentActive) {
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem("vdex:last-workspace");
      } catch {}

      const lastUsed = lastId ? workspaces.find((w) => w.id === lastId) : null;
      const connectable = workspaces.find(
        (w) => w.status === "active" && sandboxes[w.id],
      );
      const fallback = workspaces.find((w) => w.status === "active");
      const target = lastUsed || connectable || fallback || workspaces[0];
      if (target) {
        setActiveWorkspace(target.id);
      }
    }
  }, [
    workspacesLoading,
    workspaces,
    sandboxes,
    attemptCreateWorkspace,
    setActiveWorkspace,
    setWorkspaces,
    setSandboxInfo,
    targetSlug,
    strictTargetRoute,
    router,
  ]);

  const handleCliTerminalSettingsChange = useCallback(
    (next: TerminalSettings) => {
      if (cliActiveSandboxId) {
        saveSandboxTerminalSettings(cliActiveSandboxId, next);
      }
      setCliSettingsVersion((v) => v + 1);
    },
    [cliActiveSandboxId],
  );

  const handleCliTerminalSettingsReset = useCallback(() => {
    if (cliActiveSandboxId) {
      saveSandboxTerminalSettings(cliActiveSandboxId, DEFAULT_TERMINAL_SETTINGS);
    }
    setCliSettingsVersion((v) => v + 1);
  }, [cliActiveSandboxId]);

  const handleShareWorkspace = useCallback(async () => {
    if (!activeWorkspaceId || sharingWorkspace) return;
    setSharingWorkspace(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/sandbox/${activeWorkspaceId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to create share link");
      }

      const sharePath =
        typeof body.shareUrl === "string" && body.shareUrl
          ? body.shareUrl
          : null;
      if (!sharePath) {
        throw new Error("Share URL was not returned");
      }
      const fullUrl = `${window.location.origin}${sharePath}`;
      setShareLink(fullUrl);
      setShareDialogOpen(true);
    } catch (err) {
      const details = err instanceof Error ? err.message : "Unknown error";
      setShareError(details);
      reportDesktopError({
        source: "system",
        severity: "error",
        message: "Could not create share link",
        details,
        dedupeKey: `share-workspace-${activeWorkspaceId}`,
        workspaceId: activeWorkspaceId,
      });
    } finally {
      setSharingWorkspace(false);
    }
  }, [activeWorkspaceId, sharingWorkspace]);

  const copyShareLink = useCallback(async () => {
    if (!shareLink || shareCopying) return;
    setShareCopying(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        window.prompt("Copy share link:", shareLink);
      }
    } finally {
      setShareCopying(false);
    }
  }, [shareLink, shareCopying]);

  // Strict slug route behavior: when store marks workspace non-active (for example
  // max-lifetime reached), immediately go back to the hub.
  useEffect(() => {
    if (!strictTargetRoute || workspacesLoading || !targetSlug) return;
    if (!activeWorkspaceId || !activeWorkspaceFromStore) return;
    if (creatingStatus) return;

    if (activeWorkspaceFromStore.status !== "active") {
      router.replace("/desktop");
    }
  }, [
    strictTargetRoute,
    workspacesLoading,
    targetSlug,
    activeWorkspaceId,
    activeWorkspaceFromStore,
    creatingStatus,
    router,
  ]);

  // Strict slug route behavior (SWR cross-check): if workspace is unavailable
  // per server payload, go back to hub.
  useEffect(() => {
    if (!strictTargetRoute || workspacesLoading || !targetSlug) return;
    if (!activeWorkspaceId) return;
    if (activeWorkspaceLoading) return;

    const active = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!active) return;

    const definitelyUnavailable =
      active.status !== "active" ||
      sandboxLost ||
      (active.sandboxId !== null && !activeSandbox && !creatingStatus);

    if (definitelyUnavailable) {
      router.replace("/desktop");
    }
  }, [
    strictTargetRoute,
    workspacesLoading,
    targetSlug,
    activeWorkspaceId,
    workspaces,
    sandboxLost,
    activeSandbox,
    activeWorkspaceLoading,
    creatingStatus,
    router,
  ]);

  // ---- Sync window store when active workspace changes ----
  const prevWorkspaceRef = useRef<string | null>(null);
  const loadedWorkspacesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeWorkspaceId) return;

    if (
      prevWorkspaceRef.current &&
      prevWorkspaceRef.current !== activeWorkspaceId
    ) {
      flushWindowSync(prevWorkspaceRef.current);
    }
    prevWorkspaceRef.current = activeWorkspaceId;

    useWindowStore.getState().setActiveWorkspace(activeWorkspaceId);
  }, [activeWorkspaceId]);

  // Load window state from SWR into window store (once per workspace)
  // If no windows are persisted, auto-open a Files window as the welcome screen
  useEffect(() => {
    if (!activeWorkspaceId || !windowStateData) return;
    if (activeWorkspaceFromStore?.experience === "cli") {
      return;
    }
    if (loadedWorkspacesRef.current.has(activeWorkspaceId)) return;
    loadedWorkspacesRef.current.add(activeWorkspaceId);

    if (windowStateData.length > 0) {
      useWindowStore
        .getState()
        .loadWindowState(
          activeWorkspaceId,
          windowStateData as import("@/types/window").WindowState[],
        );
    } else {
      // First boot for GUI workspaces: open Files as the welcome screen.
      useWindowStore.getState().openWindow(
        {
          title: "Files",
          appId: "file-manager",
          width: 800,
          height: 500,
        },
      );
    }
  }, [
    activeWorkspaceId,
    windowStateData,
    activeWorkspaceFromStore?.experience,
    strictTargetRoute,
  ]);

  // ---- Hydrate sandbox info for non-active workspaces ----
  const hydratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (workspacesLoading) return;
    const active = workspaces.filter(
      (w) =>
        w.status === "active" &&
        w.sandboxId &&
        !sandboxes[w.id] &&
        !hydratedRef.current.has(w.id),
    );
    if (active.length === 0) return;

    for (const w of active) {
      hydratedRef.current.add(w.id);
    }

    Promise.all(
      active.map(async (w) => {
        try {
          const res = await fetch(`/api/sandbox/${w.id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.sandboxLost) {
            useWorkspaceStore.getState().markSandboxLost(w.id);
            mutateWorkspaces();
            return;
          }
          if (data.sandbox) {
            useWorkspaceStore
              .getState()
              .setSandboxInfo(w.id, data.sandbox as SandboxInfo);
          }
        } catch {}
      }),
    );
  }, [workspaces, workspacesLoading, sandboxes]);

  if (workspacesLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-background-100"
        role="status"
      >
        <Spinner size="lg" />
      </div>
    );
  }

  if (waitingForStrictTarget) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-background-100"
        role="status"
      >
        <Spinner size="lg" />
      </div>
    );
  }

  if (slugError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-100">
        <div className="max-w-sm">
          <Note type="error">
            <p className="text-copy-13 font-medium text-gray-1000">
              {slugError}
            </p>
            <p className="mt-1 text-copy-13 text-gray-900">
              The workspace may have been renamed or deleted.
            </p>
          </Note>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                router.replace("/desktop");
              }}
            >
              Go to Desktop
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (activeWorkspaceExperience === "cli") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <div className="pointer-events-none fixed right-3 top-3 z-9500 flex gap-2 rounded-md bg-black/40 p-2 backdrop-blur-sm">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            onClick={() => router.push("/desktop")}
          >
            Back to Workspaces
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={!activeWorkspaceId || sharingWorkspace}
            onClick={() => {
              void handleShareWorkspace();
            }}
          >
            {sharingWorkspace ? (
              <Spinner className="size-3.5" />
            ) : (
              <Share2 className="mr-1.5 size-3.5" />
            )}
            Share
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            onClick={() => setCliSettingsOpen(true)}
          >
            <Settings2 className="mr-1.5 size-3.5" />
            Settings
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={!activeWorkspaceId || returningToHub}
            onClick={() => setShutdownDialogOpen(true)}
          >
            {returningToHub ? <Spinner className="size-3.5" /> : "Shutdown VM"}
          </Button>
        </div>
        <AlertDialog
          open={shutdownDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setShutdownDialogOpen(false);
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
              <AlertDialogCancel
                disabled={
                  shutdownWithSnapshot ||
                  shutdownWithoutSnapshot ||
                  returningToHub
                }
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="outline"
                disabled={
                  !activeWorkspaceId ||
                  shutdownWithSnapshot ||
                  shutdownWithoutSnapshot ||
                  returningToHub
                }
                onClick={(e) => {
                  e.preventDefault();
                  if (!activeWorkspaceId) return;
                  setShutdownWithoutSnapshot(true);
                  setReturningToHub(true);
                  void stopWorkspace(activeWorkspaceId, {
                    createSnapshot: false,
                  }).finally(() => {
                    router.replace("/desktop");
                    setShutdownDialogOpen(false);
                    setShutdownWithSnapshot(false);
                    setShutdownWithoutSnapshot(false);
                    setReturningToHub(false);
                  });
                }}
              >
                {shutdownWithoutSnapshot ? (
                  <Spinner className="size-3.5" />
                ) : (
                  "Without Snapshot"
                )}
              </AlertDialogAction>
              <AlertDialogAction
                disabled={
                  !activeWorkspaceId ||
                  shutdownWithSnapshot ||
                  shutdownWithoutSnapshot ||
                  returningToHub
                }
                onClick={(e) => {
                  e.preventDefault();
                  if (!activeWorkspaceId) return;
                  setShutdownWithSnapshot(true);
                  setReturningToHub(true);
                  void stopWorkspace(activeWorkspaceId, {
                    createSnapshot: true,
                  }).finally(() => {
                    router.replace("/desktop");
                    setShutdownDialogOpen(false);
                    setShutdownWithSnapshot(false);
                    setShutdownWithoutSnapshot(false);
                    setReturningToHub(false);
                  });
                }}
              >
                {shutdownWithSnapshot ? (
                  <Spinner className="size-3.5" />
                ) : (
                  "With Snapshot"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="absolute inset-0 overflow-hidden">
          <TerminalApp
            className="absolute inset-0 overflow-hidden"
            settings={cliTerminalSettings}
          />
        </div>
        <Dialog
          open={shareDialogOpen}
          onOpenChange={(open) => {
            setShareDialogOpen(open);
            if (!open) {
              setShareError(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Workspace</DialogTitle>
              <DialogDescription>
                Anyone with this link can view your shared workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                value={shareLink ?? ""}
                readOnly
                aria-label="Share link"
                placeholder="Share link unavailable"
              />
              {shareError ? (
                <p className="text-copy-12 text-red-900">{shareError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!shareLink) return;
                  window.open(shareLink, "_blank", "noopener,noreferrer");
                }}
                disabled={!shareLink}
              >
                Open Link
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void copyShareLink();
                }}
                disabled={!shareLink || shareCopying}
              >
                {shareCopying ? <Spinner className="size-3.5" /> : "Copy Link"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <TerminalSettingsDialog
          open={cliSettingsOpen}
          onOpenChange={setCliSettingsOpen}
          settings={cliTerminalSettings}
          onChange={handleCliTerminalSettingsChange}
          onReset={handleCliTerminalSettingsReset}
          previewUrl={cliPreviewUrl}
          previewHost={cliPreviewHost}
        />
        <WorkspaceStatusToast />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      {strictTargetRoute && (
        <div className="pointer-events-none fixed right-3 top-3 z-9500 flex gap-2 rounded-md bg-black/35 p-2 backdrop-blur-sm">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            onClick={() => router.push("/desktop")}
          >
            Back to Workspaces
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={!activeWorkspaceId || sharingWorkspace}
            onClick={() => {
              void handleShareWorkspace();
            }}
          >
            {sharingWorkspace ? (
              <Spinner className="size-3.5" />
            ) : (
              <Share2 className="mr-1.5 size-3.5" />
            )}
            Share
          </Button>
        </div>
      )}
      <AlertDialog
        open={shutdownDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShutdownDialogOpen(false);
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
            <AlertDialogCancel
              disabled={
                shutdownWithSnapshot ||
                shutdownWithoutSnapshot ||
                returningToHub
              }
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={
                !activeWorkspaceId ||
                shutdownWithSnapshot ||
                shutdownWithoutSnapshot ||
                returningToHub
              }
              onClick={(e) => {
                e.preventDefault();
                if (!activeWorkspaceId) return;
                setShutdownWithoutSnapshot(true);
                setReturningToHub(true);
                void stopWorkspace(activeWorkspaceId, {
                  createSnapshot: false,
                }).finally(() => {
                  router.replace("/desktop");
                  setShutdownDialogOpen(false);
                  setShutdownWithSnapshot(false);
                  setShutdownWithoutSnapshot(false);
                  setReturningToHub(false);
                });
              }}
            >
              {shutdownWithoutSnapshot ? (
                <Spinner className="size-3.5" />
              ) : (
                "Without Snapshot"
              )}
            </AlertDialogAction>
            <AlertDialogAction
              disabled={
                !activeWorkspaceId ||
                shutdownWithSnapshot ||
                shutdownWithoutSnapshot ||
                returningToHub
              }
              onClick={(e) => {
                e.preventDefault();
                if (!activeWorkspaceId) return;
                setShutdownWithSnapshot(true);
                setReturningToHub(true);
                void stopWorkspace(activeWorkspaceId, {
                  createSnapshot: true,
                }).finally(() => {
                  router.replace("/desktop");
                  setShutdownDialogOpen(false);
                  setShutdownWithSnapshot(false);
                  setShutdownWithoutSnapshot(false);
                  setReturningToHub(false);
                });
              }}
            >
              {shutdownWithSnapshot ? (
                <Spinner className="size-3.5" />
              ) : (
                "With Snapshot"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DesktopBackground />
      {activeWorkspaceExperience === "gui" &&
      activeWorkspaceDisplayClient === "xpra" ? (
        <XpraConnector />
      ) : showRemoteDisplay ? (
        <RemoteDisplayClient />
      ) : activeWorkspaceExperience === "gui" ? (
        <UnsupportedDisplayClientNote
          displayClient={activeWorkspaceDisplayClient}
        />
      ) : null}
      {!showRemoteDisplay && (
        <>
          <Desktop />
          <WindowRenderer />
          <Taskbar
            launcherToggle={launcherToggle}
            onBackToWorkspaces={
              strictTargetRoute ? () => router.push("/desktop") : undefined
            }
            onShutdownVm={
              strictTargetRoute ? () => setShutdownDialogOpen(true) : undefined
            }
            disableShutdown={!activeWorkspaceId || returningToHub}
          />
        </>
      )}
      <NotificationToasts />
      <NotificationCenter />
      <WorkspaceStatusToast />
      <WindowSwitcher
        visible={switcher.visible}
        windows={switcher.windows}
        selectedIndex={switcher.selectedIndex}
      />
    </div>
  );
}
