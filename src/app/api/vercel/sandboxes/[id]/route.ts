import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { getSession } from "@/lib/auth/session";

export async function GET(
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
    return NextResponse.json({
      sandbox: {
        id: sandbox.sandboxId,
        status: sandbox.status,
        createdAt: sandbox.createdAt.toISOString(),
        timeout: sandbox.timeout,
        sourceSnapshotId: sandbox.sourceSnapshotId ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get sandbox" },
      { status: 500 },
    );
  }
}
