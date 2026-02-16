import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { getSession } from "@/lib/auth/session";
import { expireWarmPoolEntriesForSandbox } from "@/lib/sandbox/warm-pool";

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
    const snapshot = await sandbox.snapshot();
    const expiredPoolEntries = await expireWarmPoolEntriesForSandbox(id);
    return NextResponse.json({
      snapshot: {
        id: snapshot.snapshotId,
        status: snapshot.status,
        sizeBytes: snapshot.sizeBytes,
        sourceSandboxId: snapshot.sourceSandboxId,
        createdAt: snapshot.createdAt.toISOString(),
        expiresAt: snapshot.expiresAt.toISOString(),
      },
      expiredPoolEntries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create snapshot" },
      { status: 500 },
    );
  }
}
