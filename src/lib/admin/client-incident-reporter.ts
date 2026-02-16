"use client";

import { useWorkspaceStore } from "@/stores/workspace-store";

export type ClientIncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";

export interface ClientIncidentInput {
  title: string;
  fingerprintSeed: string;
  severity?: ClientIncidentSeverity;
  source?: string;
  details?: string;
  workspaceId?: string | null;
  context?: Record<string, unknown>;
  dedupeKey?: string;
}

const recentReports = new Map<string, number>();
const REPORT_DEDUPE_MS = 10_000;

function shouldReport(dedupeKey: string, dedupeMs = REPORT_DEDUPE_MS): boolean {
  const now = Date.now();
  const prev = recentReports.get(dedupeKey);
  if (prev && now - prev < dedupeMs) return false;
  recentReports.set(dedupeKey, now);
  return true;
}

export async function reportClientIncident(input: ClientIncidentInput): Promise<void> {
  const title = input.title.trim();
  if (!title) return;

  const workspaceId =
    input.workspaceId ?? useWorkspaceStore.getState().activeWorkspaceId ?? null;
  const dedupeKey =
    input.dedupeKey ??
    `${input.source ?? "client"}:${input.severity ?? "sev3"}:${title}:${workspaceId ?? "none"}`;

  if (!shouldReport(dedupeKey)) return;

  const route =
    typeof window !== "undefined" ? window.location.pathname : undefined;

  try {
    await fetch("/api/incidents/client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        title,
        fingerprintSeed: input.fingerprintSeed,
        severity: input.severity ?? "sev3",
        source: input.source ?? "client",
        details: input.details,
        workspaceId,
        context: {
          route,
          ...input.context,
        },
      }),
    });
  } catch {
    // Best-effort reporting only.
  }
}
