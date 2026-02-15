import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listIncidents } from "@/lib/admin/ops";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = new URL(req.url).searchParams;
  const incidents = await listIncidents({
    status: (searchParams.get("status") as "open" | "acknowledged" | "resolved" | null) ?? undefined,
    severity: (searchParams.get("severity") as "sev1" | "sev2" | "sev3" | "sev4" | null) ?? undefined,
    kind: (searchParams.get("kind") as
      | "workspace_error"
      | "api_error"
      | "snapshot_rebuild_error"
      | "pool_degradation"
      | "client_exception"
      | null) ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  return NextResponse.json({ incidents });
}
