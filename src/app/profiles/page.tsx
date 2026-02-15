import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ProfilesClient } from "./profiles-client";

export default async function ProfilesPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-6xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-copy-13 text-amber-900">
        Golden snapshot toolchain update: CLI and GUI images now include Rust/Cargo and C build tools
        (`gcc`, `g++`, `make`) by default.
      </div>
      <ProfilesClient />
    </div>
  );
}
