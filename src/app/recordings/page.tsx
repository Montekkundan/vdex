import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { RoutePending } from "@/components/layout/route-pending";
import { RecordingsClient } from "./recordings-client";

async function RecordingsAuthContent() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <RecordingsClient />;
}

export default function RecordingsPage() {
  return (
    <Suspense fallback={<RoutePending />}>
      <RecordingsAuthContent />
    </Suspense>
  );
}
