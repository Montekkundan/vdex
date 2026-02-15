import { NextResponse } from "next/server";
import { Snapshot } from "@vercel/sandbox";
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
    const snapshot = await Snapshot.get({ snapshotId: id });
    return NextResponse.json({
      snapshot: {
        id: snapshot.snapshotId,
        status: snapshot.status,
        sizeBytes: snapshot.sizeBytes,
        sourceSandboxId: snapshot.sourceSandboxId,
        createdAt: snapshot.createdAt.toISOString(),
        expiresAt: snapshot.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get snapshot" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const snapshot = await Snapshot.get({ snapshotId: id });
    await snapshot.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete snapshot" },
      { status: 500 },
    );
  }
}
