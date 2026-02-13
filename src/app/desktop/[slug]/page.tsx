import { getSession } from "@/lib/auth/session";
import { DesktopShell } from "../desktop-shell";
import { redirect } from "next/navigation";

export default async function WorkspacePage({
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
