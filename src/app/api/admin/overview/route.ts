import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOverviewMetrics } from "@/lib/admin/ops";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const overview = await getOverviewMetrics();
  return NextResponse.json(overview);
}
