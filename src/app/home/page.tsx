import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { HomeScene } from "@/components/home-scene";
import { RoutePending } from "@/components/layout/route-pending";

async function HomeAuthContent() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return <HomeScene isLoggedIn />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<RoutePending />}>
      <HomeAuthContent />
    </Suspense>
  );
}
