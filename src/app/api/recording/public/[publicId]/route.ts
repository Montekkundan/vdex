import { NextResponse } from "next/server";
import { getPublicRecordingByPublicId } from "@/lib/recordings/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const recording = await getPublicRecordingByPublicId(publicId);
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return NextResponse.json({ recording });
}
