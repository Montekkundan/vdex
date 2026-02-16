import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { upsertIncident, type IncidentSeverity } from "@/lib/admin/ops";

type ClientIncidentBody = {
  title?: unknown;
  fingerprintSeed?: unknown;
  severity?: unknown;
  source?: unknown;
  details?: unknown;
  workspaceId?: unknown;
  context?: unknown;
};

function isIncidentSeverity(value: unknown): value is IncidentSeverity {
  return value === "sev1" || value === "sev2" || value === "sev3" || value === "sev4";
}

function asSafeString(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asSafeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.length > 64) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v == null
    ) {
      out[k] = typeof v === "string" ? v.slice(0, 500) : v;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ClientIncidentBody;
  const title = asSafeString(body.title, 200);
  const fingerprintSeed = asSafeString(body.fingerprintSeed, 400);
  if (!title || !fingerprintSeed) {
    return NextResponse.json(
      { error: "title and fingerprintSeed are required" },
      { status: 400 },
    );
  }

  const severity = isIncidentSeverity(body.severity) ? body.severity : "sev3";
  const source = asSafeString(body.source, 120) ?? "client";
  const details = asSafeString(body.details, 1200);
  const workspaceId = asSafeString(body.workspaceId, 64);
  const context = asSafeObject(body.context);

  const ua = req.headers.get("user-agent");
  if (ua) context.userAgent = ua.slice(0, 500);
  context.userId = session.id;
  if (details) context.details = details;

  await upsertIncident({
    kind: "client_exception",
    severity,
    title,
    fingerprintSeed,
    source,
    affectedUsers: 1,
    affectedWorkspaces: workspaceId ? 1 : 0,
    latestContext: {
      workspaceId,
      ...context,
    },
  });

  return NextResponse.json({ ok: true });
}
