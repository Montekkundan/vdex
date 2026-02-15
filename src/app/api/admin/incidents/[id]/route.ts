import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { adminIncidents } from "@/lib/db/schema";
import { getIncidentTimeline } from "@/lib/admin/ops";

function withSearch(url: string | null, searchTerm: string | null) {
  if (!url) return null;
  if (!searchTerm) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}q=${encodeURIComponent(searchTerm)}`;
}

function getPosthogLinks(searchTerm: string | null) {
  const projectBase = process.env.POSTHOG_PROJECT_URL?.replace(/\/$/, "") ?? null;
  const errorTrackingBase =
    process.env.POSTHOG_ERROR_TRACKING_URL?.replace(/\/$/, "") ??
    (projectBase ? `${projectBase}/error_tracking` : null);
  const sessionReplayBase =
    process.env.POSTHOG_SESSION_REPLAY_URL?.replace(/\/$/, "") ??
    (projectBase ? `${projectBase}/replay` : null);
  const activityBase =
    process.env.POSTHOG_ACTIVITY_URL?.replace(/\/$/, "") ??
    projectBase;

  return {
    errorTracking: withSearch(errorTrackingBase, searchTerm),
    sessionReplay: withSearch(sessionReplayBase, searchTerm),
    activity: withSearch(activityBase, searchTerm),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const detail = await getIncidentTimeline(id);
  if (!detail.incident) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const context =
    detail.incident.latestContext &&
    typeof detail.incident.latestContext === "object"
      ? (detail.incident.latestContext as Record<string, unknown>)
      : {};

  const searchTerm =
    (typeof context.requestId === "string" && context.requestId) ||
    (typeof context.workspaceId === "string" && context.workspaceId) ||
    detail.incident.fingerprint ||
    null;

  return NextResponse.json({
    ...detail,
    posthogLinks: getPosthogLinks(searchTerm),
    posthogSearchTerm: searchTerm,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status } = (await req.json().catch(() => ({}))) as {
    status?: "open" | "acknowledged" | "resolved";
  };

  if (!status || !["open", "acknowledged", "resolved"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { id } = await params;
  const [updated] = await db
    .update(adminIncidents)
    .set({ status, updatedAt: new Date() })
    .where(eq(adminIncidents.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ incident: updated });
}
