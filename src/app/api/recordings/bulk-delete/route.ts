import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteRecordingsBulk } from "@/lib/recordings/service";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must contain at least one recording id" }, { status: 400 });
  }

  const deleted = await deleteRecordingsBulk(session.id, ids);
  return NextResponse.json({ deleted });
}
