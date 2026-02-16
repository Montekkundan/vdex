import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SandboxesClient } from "./sandboxes-client";
import { RoutePending } from "@/components/layout/route-pending";

async function SandboxesAuthContent() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <SandboxesClient />;
}

export default function SandboxesPage() {
  return (
    <Suspense fallback={<RoutePending />}>
      <SandboxesAuthContent />
    </Suspense>
  );
}
