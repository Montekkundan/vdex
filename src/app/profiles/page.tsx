import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ProfilesClient } from "./profiles-client";

export default async function ProfilesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <ProfilesClient />;
}
