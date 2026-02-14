import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { HomeScene } from "@/components/home-scene";

export default async function Page() {
  const session = await getSession();
  if (session) {
    redirect("/desktop");
  }

  return <HomeScene />;
}
