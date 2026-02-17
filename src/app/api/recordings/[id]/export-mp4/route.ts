import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMp4Status, queueMp4Export } from "@/lib/recordings/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const status = await getMp4Status(session.id, id);
  if (!status) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ export: status });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const recording = await queueMp4Export(session.id, id);
    return NextResponse.json({ recording });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to queue export";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
