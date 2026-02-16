import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ProfilesClient } from "./profiles-client";
import { RoutePending } from "@/components/layout/route-pending";

async function ProfilesAuthContent() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <ProfilesClient />;
}

export default function ProfilesPage() {
  return (
    <Suspense fallback={<RoutePending />}>
      <ProfilesAuthContent />
    </Suspense>
  );
}
