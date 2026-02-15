import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SandboxesClient } from "./sandboxes-client";

export default async function SandboxesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return <SandboxesClient />;
}
