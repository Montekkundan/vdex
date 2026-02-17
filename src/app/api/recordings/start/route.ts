import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { startRecording } from "@/lib/recordings/service";
import type { RecordingMode } from "@/types/recording";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    title?: string;
    mode?: RecordingMode;
  };

  if (!body.workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  try {
    const recording = await startRecording({
      userId: session.id,
      workspaceId: body.workspaceId,
      title: body.title,
      mode: body.mode,
    });
    return NextResponse.json({ recording });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start recording";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
