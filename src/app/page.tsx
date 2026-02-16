import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { HomeScene } from "@/components/home-scene";
import { RoutePending } from "@/components/layout/route-pending";

async function HomeGate() {
  const session = await getSession();
  if (session) {
    redirect("/desktop");
  }

  return <HomeScene />;
}

export default function Page() {
  return (
    <Suspense fallback={<RoutePending />}>
      <HomeGate />
    </Suspense>
  );
}
