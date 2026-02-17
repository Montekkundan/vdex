import { NextResponse } from "next/server";
import { RECORDING_DOWNLOAD_FILENAME_PREFIX } from "@/lib/recordings/constants";
import { getDownloadableRecordingForPublicId } from "@/lib/recordings/service";
import { getRecordingObject } from "@/lib/recordings/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const row = await getDownloadableRecordingForPublicId(publicId);
  if (!row || !row.mp4StorageKey) {
    return NextResponse.json({ error: "MP4 is not ready" }, { status: 404 });
  }

  const bytes = await getRecordingObject(row.mp4StorageKey);
  if (!bytes) {
    return NextResponse.json({ error: "MP4 artifact is missing" }, { status: 404 });
  }

  const titleSlug = (row.title || row.id)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
  const filename = `${RECORDING_DOWNLOAD_FILENAME_PREFIX}-${titleSlug || row.id}.mp4`;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
