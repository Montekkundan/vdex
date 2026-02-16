import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { warmPool } from "@/lib/db/schema";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { json } = await Sandbox.list();
    const sandboxes = json.sandboxes ?? [];
    const sandboxIds = sandboxes.map((sandbox) => sandbox.id).filter(Boolean);

    const poolRows = sandboxIds.length > 0
      ? await db
          .select({
            sandboxId: warmPool.sandboxId,
            userId: warmPool.userId,
          })
          .from(warmPool)
          .where(inArray(warmPool.sandboxId, sandboxIds))
      : [];

    const poolBySandboxId = new Map(
      poolRows.map((row) => [row.sandboxId, row]),
    );

    const sandboxesWithLaunchType = sandboxes.map((sandbox) => {
      const poolRow = poolBySandboxId.get(sandbox.id);
      const launchType = poolRow
        ? (poolRow.userId ? "warm_pool_policy" : "warm_pool")
        : "cold_boot";
      return {
        ...sandbox,
        launchType,
      };
    });

    return NextResponse.json({
      sandboxes: sandboxesWithLaunchType,
      pagination: json.pagination,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list sandboxes" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : "";

  try {
    const sandbox = snapshotId
      ? await Sandbox.create({
          source: { type: "snapshot", snapshotId },
        })
      : await Sandbox.create({
          runtime: "node24",
        });

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
      { error: err instanceof Error ? err.message : "Failed to create sandbox" },
      { status: 500 },
    );
  }
}
