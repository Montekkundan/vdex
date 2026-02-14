import { NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { platformDefaults, workspaceSnapshots } from "@/lib/db/schema";
import { getGoldenSnapshotId } from "@/lib/sandbox/golden-snapshot";
import { POOL_LIMITS } from "@/lib/pools/constants";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [snapshots, defaults, guiGolden, cliGolden] = await Promise.all([
    db
      .select()
      .from(workspaceSnapshots)
      .where(
        and(
          eq(workspaceSnapshots.userId, session.id),
          sql`${workspaceSnapshots.status} <> 'archived'`,
        ),
      )
      .orderBy(sql`${workspaceSnapshots.updatedAt} DESC`),
    db.select().from(platformDefaults),
    getGoldenSnapshotId("gui"),
    getGoldenSnapshotId("cli"),
  ]);

  return NextResponse.json({
    snapshots,
    platformDefaults: defaults,
    fallbackDefaults: {
      gui: guiGolden,
      cli: cliGolden,
    },
    limits: {
      maxSnapshotsPerUser: POOL_LIMITS.maxSnapshotsPerUser,
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;
  const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : "vercel";
  const experience = typeof body.experience === "string" ? body.experience : "gui";
  const displayClient =
    typeof body.displayClient === "string"
      ? body.displayClient
      : experience === "cli"
        ? "none"
        : "xpra";
  const sizeProfile =
    typeof body.sizeProfile === "string" ? body.sizeProfile : "balanced_4c8g";

  if (!name || !snapshotId) {
    return NextResponse.json(
      { error: "name and snapshotId are required" },
      { status: 400 },
    );
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(workspaceSnapshots)
    .where(
      and(
        eq(workspaceSnapshots.userId, session.id),
        sql`${workspaceSnapshots.status} <> 'archived'`,
      ),
    );

  if (total >= POOL_LIMITS.maxSnapshotsPerUser) {
    return NextResponse.json(
      {
        error: "Snapshot limit reached",
        limit: POOL_LIMITS.maxSnapshotsPerUser,
      },
      { status: 429 },
    );
  }

  const [created] = await db
    .insert(workspaceSnapshots)
    .values({
      userId: session.id,
      provider,
      experience,
      displayClient,
      sizeProfile,
      name,
      description,
      snapshotId,
      sourceType: "capture",
      status: "ready",
      isDefault: false,
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json({ snapshot: created });
}
