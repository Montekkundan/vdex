"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useActiveSandbox } from "@/stores/workspace-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useDesktopStore } from "@/stores/desktop-store";
import {
  sandboxServiceFetcher,
  sandboxServiceOnErrorRetry,
  useSandboxServiceClient,
} from "@/lib/hooks/use-sandbox-service-client";

const HIDDEN_POLL_INTERVAL_MS = 60000;
const FAST_NOTIFICATION_POLL_INTERVAL_MS = 3000;
const SLOW_NOTIFICATION_POLL_INTERVAL_MS = 30000;
const FAST_APPS_POLL_INTERVAL_MS = 5000;
const SLOW_APPS_POLL_INTERVAL_MS = 60000;

function usePageVisibility() {
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );

  useEffect(() => {
    const onVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return isPageVisible;
}

function isTransitioningStatus(status?: string | null) {
  if (!status) return false;
  return status.toLowerCase() !== "running";
}

interface BridgeNotification {
  id: number;
  appName: string;
  replacesId: number;
  icon: string | null;
  summary: string;
  body: string;
  actions: string[];
  expires: number;
  timestamp: number;
  urgency: "low" | "normal" | "critical";
  category: string | null;
  transient: boolean;
  resident: boolean;
  desktopEntry: string | null;
}

interface BridgeNotificationsResponse {
  notifications: BridgeNotification[];
}



/**
 * Polls the sandbox bridge for notifications sent via `notify-send` or GLib
 * inside the sandbox. New notifications are fed into the existing
 * notification store so they appear as toast popups and in the notification
 * center, identical to Xpra-forwarded notifications.
 *
 * Uses SWR with `refreshInterval` for efficient polling — only fetches
 * notifications newer than the last seen timestamp.
 */
export function useDbusNotifications() {
  const { activeWorkspaceId, sandbox } = useActiveSandbox();
  const { serviceUrl } = useSandboxServiceClient();
  const isPageVisible = usePageVisibility();
  const sinceRef = useRef(0);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const refreshInterval = !isPageVisible
    ? HIDDEN_POLL_INTERVAL_MS
    : isTransitioningStatus(sandbox?.status)
      ? FAST_NOTIFICATION_POLL_INTERVAL_MS
      : SLOW_NOTIFICATION_POLL_INTERVAL_MS;

  const { data } = useSWR<BridgeNotificationsResponse>(
    serviceUrl("/bridge/notifications?since=0"),
    sandboxServiceFetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 500,
      onErrorRetry: sandboxServiceOnErrorRetry,
    },
  );

  useEffect(() => {
    if (!data?.notifications?.length) return;

    for (const notif of data.notifications) {
      if (notif.timestamp > sinceRef.current) {
        sinceRef.current = notif.timestamp;
      }

      addNotification({
        id: notif.id,
        replacesId: notif.replacesId,
        appName: notif.appName,
        summary: notif.summary,
        body: notif.body,
        icon: notif.icon,
        actions: notif.actions,
        expires: notif.expires,
        urgency: notif.urgency ?? "normal",
        source: "system",
        severity:
          notif.urgency === "critical"
            ? "critical"
            : notif.urgency === "low"
              ? "info"
              : "warning",
        category: notif.category ?? null,
        transient: notif.transient ?? false,
        workspaceId: activeWorkspaceId,
      });
    }
  }, [data, addNotification, activeWorkspaceId]);
}

// ---------------------------------------------------------------------------
// Desktop entry monitor
// ---------------------------------------------------------------------------

interface AppsGenerationResponse {
  generation: number;
}

/**
 * Polls the bridge for .desktop file changes (via inotify in the Python
 * daemon). When the generation counter bumps, re-fetches the full desktop
 * entry list so newly installed apps appear on the desktop and in menus.
 */
export function useDesktopEntryMonitor() {
  const { activeWorkspaceId, sandbox } = useActiveSandbox();
  const { serviceUrl } = useSandboxServiceClient();
  const isPageVisible = usePageVisibility();
  const generationRef = useRef<number | null>(null);
  const fetchRemoteApps = useDesktopStore((s) => s.fetchRemoteApps);
  const refreshInterval = !isPageVisible
    ? HIDDEN_POLL_INTERVAL_MS
    : isTransitioningStatus(sandbox?.status)
      ? FAST_APPS_POLL_INTERVAL_MS
      : SLOW_APPS_POLL_INTERVAL_MS;

  const { data } = useSWR<AppsGenerationResponse>(
    serviceUrl("/bridge/apps-generation"),
    sandboxServiceFetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 2000,
      onErrorRetry: sandboxServiceOnErrorRetry,
    },
  );

  useEffect(() => {
    if (data == null || !sandbox?.domains.services) return;
    const gen = data.generation;

    if (generationRef.current === null) {
      // First load — just record the baseline
      generationRef.current = gen;
      return;
    }

    if (gen !== generationRef.current) {
      generationRef.current = gen;
      fetchRemoteApps(activeWorkspaceId, sandbox.domains.services);
    }
  }, [data, activeWorkspaceId, sandbox?.domains.services, fetchRemoteApps]);
}
