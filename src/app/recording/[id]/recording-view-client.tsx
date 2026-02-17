"use client";

import { useState } from "react";
import { RecordingViewer } from "@/components/recordings/RecordingViewer";
import type { RecordingDetail } from "@/types/recording";

export function RecordingViewClient({
  recording,
}: {
  recording: RecordingDetail;
}) {
  const [isExporting, setIsExporting] = useState(false);

  return (
    <RecordingViewer
      recording={recording}
      mp4Url={`/api/recordings/${recording.id}/download`}
      canExport
      isExporting={isExporting}
      onRequestExport={async () => {
        setIsExporting(true);
        try {
          await fetch(`/api/recordings/${recording.id}/export-mp4`, { method: "POST" });
        } finally {
          setIsExporting(false);
        }
      }}
    />
  );
}
