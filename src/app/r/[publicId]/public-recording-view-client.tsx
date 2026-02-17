"use client";

import { RecordingViewer } from "@/components/recordings/RecordingViewer";
import type { RecordingDetail } from "@/types/recording";

export function PublicRecordingViewClient({
  recording,
}: {
  recording: RecordingDetail;
}) {
  return (
    <RecordingViewer
      recording={recording}
      mp4Url={`/api/recording/public/${recording.publicId ?? ""}/download`}
      canExport={false}
    />
  );
}
