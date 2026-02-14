import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { HomeScene } from "@/components/home-scene";

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return <HomeScene isLoggedIn />;
}
