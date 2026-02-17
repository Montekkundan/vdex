import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteRecording, getRecordingByIdForUser, updateRecording } from "@/lib/recordings/service";
import type { RecordingVisibility } from "@/types/recording";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const recording = await getRecordingByIdForUser(session.id, id);
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ recording });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    visibility?: RecordingVisibility;
  };

  const recording = await updateRecording(session.id, id, {
    title: body.title,
    visibility: body.visibility,
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ recording });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteRecording(session.id, id);
  if (!ok) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
