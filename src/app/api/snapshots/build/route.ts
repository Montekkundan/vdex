import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaceSnapshots } from "@/lib/db/schema";
import { buildGoldenSnapshot } from "@/lib/sandbox/build-golden-snapshot";
import { POOL_LIMITS } from "@/lib/pools/constants";
import { validateWorkspaceExperience } from "@/lib/runtime/validation";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const installScript =
    typeof body.installScript === "string" ? body.installScript : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : null;
  const experienceInput = body.experience ?? "gui";
  const resolvedExperience = validateWorkspaceExperience(experienceInput);
  if (!resolvedExperience.ok) {
    return NextResponse.json({ error: resolvedExperience.error.message }, { status: 400 });
  }
  if (!name || !installScript) {
    return NextResponse.json(
      { error: "name and installScript are required" },
      { status: 400 },
    );
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(workspaceSnapshots)
    .where(
      and(
        eq(workspaceSnapshots.userId, session.id),
        eq(workspaceSnapshots.status, "ready"),
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

  const [pending] = await db
    .insert(workspaceSnapshots)
    .values({
      userId: session.id,
      provider: "vercel",
      experience: resolvedExperience.value,
      displayClient: resolvedExperience.value === "cli" ? "none" : "xpra",
      sizeProfile: "balanced_4c8g",
      name,
      description,
      snapshotId: "pending",
      sourceType: "script",
      installScript,
      status: "building",
      isDefault: false,
      updatedAt: new Date(),
    })
    .returning();

  try {
    const result = await buildGoldenSnapshot({
      installScript,
      logPrefix: `user-snapshot:${session.id}:${pending.id}`,
      experience: resolvedExperience.value,
      persistAsPlatformDefault: false,
    });
    const [snapshot] = await db
      .update(workspaceSnapshots)
      .set({
        snapshotId: result.snapshotId,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(workspaceSnapshots.id, pending.id))
      .returning();
    return NextResponse.json({ snapshot });
  } catch (err) {
    await db
      .update(workspaceSnapshots)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(workspaceSnapshots.id, pending.id));
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Snapshot build failed",
      },
      { status: 500 },
    );
  }
}
