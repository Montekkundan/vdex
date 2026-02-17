import { NextResponse } from "next/server";
import { getQueuedExportIds, processMp4Export } from "@/lib/recordings/service";

function isAllowed(req: Request): boolean {
  const configured = process.env.RECORDINGS_QUEUE_TOKEN;
  if (!configured) return true;
  return req.headers.get("x-recordings-queue-token") === configured;
}

export async function POST(req: Request) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = await getQueuedExportIds(10);
  await Promise.all(ids.map((id) => processMp4Export(id)));
  return NextResponse.json({ processed: ids.length, ids });
}
