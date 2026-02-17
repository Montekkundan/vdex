import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listRecordings } from "@/lib/recordings/service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const recordings = await listRecordings(session.id);
  return NextResponse.json({ recordings });
}
