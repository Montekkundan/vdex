import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getActiveRecordingForWorkspace, getLatestCompletedRecordingForWorkspace } from "@/lib/recordings/service";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const [active, latestCompleted] = await Promise.all([
    getActiveRecordingForWorkspace(session.id, workspaceId),
    getLatestCompletedRecordingForWorkspace(session.id, workspaceId),
  ]);

  return NextResponse.json({ active, latestCompleted });
}
