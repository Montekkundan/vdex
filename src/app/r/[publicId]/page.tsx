import { notFound } from "next/navigation";
import { getPublicRecordingByPublicId } from "@/lib/recordings/service";
import { PublicRecordingViewClient } from "./public-recording-view-client";

export default async function PublicRecordingPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const recording = await getPublicRecordingByPublicId(publicId);
  if (!recording) {
    notFound();
  }

  return <PublicRecordingViewClient recording={recording} />;
}
