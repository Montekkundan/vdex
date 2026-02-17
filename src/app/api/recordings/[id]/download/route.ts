import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { RECORDING_DOWNLOAD_FILENAME_PREFIX } from "@/lib/recordings/constants";
import { getDownloadableRecordingForUser } from "@/lib/recordings/service";
import { getRecordingObject } from "@/lib/recordings/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const row = await getDownloadableRecordingForUser(session.id, id);
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
      "Cache-Control": "private, max-age=60",
    },
  });
}
