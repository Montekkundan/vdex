import { NextResponse } from "next/server";
import { expireStaleRecordings } from "@/lib/recordings/service";

function isAllowed(req: Request): boolean {
  const configured = process.env.RECORDINGS_CLEANUP_TOKEN;
  if (!configured) return true;
  return req.headers.get("x-recordings-cleanup-token") === configured;
}

export async function POST(req: Request) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expired = await expireStaleRecordings();
  return NextResponse.json({ expired });
}
