import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DesktopHub } from "./desktop-hub";

export default async function DesktopPage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return <DesktopHub />;
}
