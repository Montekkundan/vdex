"use client";

export type DesktopLogScope =
  | "desktop"
  | "xpra"
  | "terminal"
  | "files"
  | "code"
  | "app-store"
  | "system";

type DesktopLogLevel = "debug" | "info" | "warn" | "error";

const LOG_DEDUPE_WINDOW_MS = 4_000;
const recentLogs = new Map<string, number>();

function shouldLogOnce(key: string, dedupeMs = LOG_DEDUPE_WINDOW_MS): boolean {
  const now = Date.now();
  const prev = recentLogs.get(key);
  if (prev && now - prev < dedupeMs) return false;
  recentLogs.set(key, now);
  return true;
}

export function logDesktop(
  level: DesktopLogLevel,
  scope: DesktopLogScope,
  message: string,
  options?: {
    error?: unknown;
    onceKey?: string;
    dedupeMs?: number;
  },
) {
  const prefix = `[desktop:${scope}]`;
  const text = `${prefix} ${message}`;
  const onceKey = options?.onceKey;
  if (onceKey && !shouldLogOnce(`${scope}:${onceKey}`, options?.dedupeMs)) {
    return;
  }

  if (level === "error") {
    console.error(text, options?.error ?? "");
    return;
  }
  if (level === "warn") {
    console.warn(text, options?.error ?? "");
    return;
  }
  if (level === "info") {
    console.info(text);
    return;
  }
  console.debug(text);
}

