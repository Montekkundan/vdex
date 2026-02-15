import { NextResponse } from "next/server";
import { Snapshot } from "@vercel/sandbox";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { json } = await Snapshot.list();
    return NextResponse.json({
      snapshots: json.snapshots,
      pagination: json.pagination,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list snapshots" },
      { status: 500 },
    );
  }
}
