"use client";

import {
  useNotificationStore,
  type NotificationUrgency,
} from "@/stores/notification-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { logDesktop, type DesktopLogScope } from "./logger";

export type DesktopErrorSource = "terminal" | "files" | "code" | "xpra" | "system";
export type DesktopErrorSeverity = "info" | "warning" | "error" | "critical";

export interface DesktopAppErrorEvent {
  source: DesktopErrorSource;
  severity: DesktopErrorSeverity;
  message: string;
  details?: string;
  dedupeKey?: string;
  workspaceId?: string | null;
}

const recentErrors = new Map<string, number>();
const DEFAULT_DEDUPE_MS = 6_000;

function toUrgency(severity: DesktopErrorSeverity): NotificationUrgency {
  if (severity === "critical") return "critical";
  if (severity === "info") return "low";
  return "normal";
}

function getDedupeKey(event: DesktopAppErrorEvent): string {
  return event.dedupeKey ?? `${event.source}:${event.severity}:${event.message}`;
}

function shouldNotify(key: string, dedupeMs = DEFAULT_DEDUPE_MS): boolean {
  const now = Date.now();
  const prev = recentErrors.get(key);
  if (prev && now - prev < dedupeMs) return false;
  recentErrors.set(key, now);
  return true;
}

export function reportDesktopError(event: DesktopAppErrorEvent): void {
  const dedupeKey = getDedupeKey(event);
  if (!shouldNotify(dedupeKey)) return;

  const workspaceId =
    event.workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId ?? null;
  const body = event.details?.trim() ? event.details : "";
  const sourceLabel = event.source.toUpperCase();

  const scope: DesktopLogScope =
    event.source === "files"
      ? "files"
      : event.source === "code"
        ? "code"
        : event.source === "terminal"
          ? "terminal"
          : event.source === "xpra"
            ? "xpra"
            : "system";

  if (event.severity === "critical" || event.severity === "error") {
    logDesktop("error", scope, event.message, {
      onceKey: dedupeKey,
      error: event.details,
    });
  } else if (event.severity === "warning") {
    logDesktop("warn", scope, event.message, { onceKey: dedupeKey });
  } else {
    logDesktop("info", scope, event.message, { onceKey: dedupeKey });
  }

  useNotificationStore.getState().addNotification({
    id: Date.now() + Math.floor(Math.random() * 1000),
    replacesId: 0,
    appName: sourceLabel,
    summary: event.message,
    body,
    icon: null,
    actions: [],
    expires: event.severity === "critical" ? 0 : 7000,
    urgency: toUrgency(event.severity),
    category: "desktop.error",
    source: event.source,
    severity: event.severity,
    workspaceId,
  });
}

