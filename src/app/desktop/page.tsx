import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DesktopHub } from "./desktop-hub";
import { RoutePending } from "@/components/layout/route-pending";

async function DesktopAuthContent() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return <DesktopHub />;
}

export default function DesktopPage() {
  return (
    <Suspense fallback={<RoutePending />}>
      <DesktopAuthContent />
    </Suspense>
  );
}
