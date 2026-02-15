import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const sandbox = await Sandbox.get({ sandboxId: id });
    await sandbox.stop();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to stop sandbox" },
      { status: 500 },
    );
  }
}
