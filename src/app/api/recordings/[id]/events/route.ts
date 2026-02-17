import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { appendTerminalEventsForUser } from "@/lib/recordings/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    events?: Array<{ tMs?: number; eventType?: string; payload?: string }>;
  };

  const events = Array.isArray(body.events)
    ? body.events
        .filter((event): event is { tMs: number; eventType: string; payload: string } => (
          typeof event?.tMs === "number" &&
          Number.isFinite(event.tMs) &&
          event.tMs >= 0 &&
          typeof event?.eventType === "string" &&
          event.eventType.length > 0 &&
          typeof event?.payload === "string"
        ))
        .slice(0, 200)
    : [];

  if (events.length === 0) {
    return NextResponse.json({ ok: true, appended: 0 });
  }

  await appendTerminalEventsForUser({
    userId: session.id,
    recordingId: id,
    events,
  });

  return NextResponse.json({ ok: true, appended: events.length });
}
