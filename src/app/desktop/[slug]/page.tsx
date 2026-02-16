import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { DesktopShell } from "../desktop-shell";
import { redirect } from "next/navigation";
import { RoutePending } from "@/components/layout/route-pending";

async function WorkspaceAuthContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  const { slug } = await params;

  if (!session) {
    redirect("/");
  }

  return <DesktopShell user={session} targetSlug={slug} strictTargetRoute />;
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<RoutePending />}>
      <WorkspaceAuthContent params={params} />
    </Suspense>
  );
}
