import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { userPoolPolicies } from "@/lib/db/schema";
import { POOL_LIMITS } from "@/lib/pools/constants";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [existing] = await db
    .select()
    .from(userPoolPolicies)
    .where(and(eq(userPoolPolicies.id, id), eq(userPoolPolicies.userId, session.id)));
  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const value = typeof body.name === "string" ? body.name.trim() : "";
    if (!value) {
      return NextResponse.json({ error: "Policy name cannot be empty" }, { status: 400 });
    }
    updates.name = value;
  }
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (body.maxAgeMinutes !== undefined) {
    const value = Number(body.maxAgeMinutes);
    updates.maxAgeMinutes = Number.isFinite(value) ? Math.max(5, Math.min(180, value)) : existing.maxAgeMinutes;
  }
  if (body.target !== undefined) {
    const target = Math.max(
      0,
      Math.min(POOL_LIMITS.maxTargetPerBucket, Number(body.target)),
    );
    const [{ totalTarget }] = await db
      .select({
        totalTarget: sql<number>`COALESCE(SUM(${userPoolPolicies.target}), 0)`,
      })
      .from(userPoolPolicies)
      .where(
        and(
          eq(userPoolPolicies.userId, session.id),
          sql`${userPoolPolicies.id} <> ${id}`,
        ),
      );
    if (Number(totalTarget) + target > POOL_LIMITS.maxWarmEntriesPerUserTotal) {
      return NextResponse.json(
        {
          error: "Total warm entries target exceeded",
          limit: POOL_LIMITS.maxWarmEntriesPerUserTotal,
        },
        { status: 429 },
      );
    }
    updates.target = target;
  }

  const [policy] = await db
    .update(userPoolPolicies)
    .set(updates)
    .where(and(eq(userPoolPolicies.id, id), eq(userPoolPolicies.userId, session.id)))
    .returning();

  return NextResponse.json({ policy });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const [deleted] = await db
    .delete(userPoolPolicies)
    .where(and(eq(userPoolPolicies.id, id), eq(userPoolPolicies.userId, session.id)))
    .returning();
  if (!deleted) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
