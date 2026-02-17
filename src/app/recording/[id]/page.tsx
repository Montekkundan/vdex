import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getRecordingByIdForUser } from "@/lib/recordings/service";
import { RecordingViewClient } from "./recording-view-client";

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  const { id } = await params;
  const recording = await getRecordingByIdForUser(session.id, id);
  if (!recording) {
    notFound();
  }

  return <RecordingViewClient recording={recording} />;
}
