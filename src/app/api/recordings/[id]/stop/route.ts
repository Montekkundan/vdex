import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { stopRecording } from "@/lib/recordings/service";

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
    const recording = await stopRecording({
      userId: session.id,
      recordingId: id,
    });
    return NextResponse.json({ recording });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to stop recording";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
