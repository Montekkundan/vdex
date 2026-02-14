import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaceSnapshots } from "@/lib/db/schema";

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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (typeof body.isDefault === "boolean") updates.isDefault = body.isDefault;

  const [existing] = await db
    .select()
    .from(workspaceSnapshots)
    .where(and(eq(workspaceSnapshots.id, id), eq(workspaceSnapshots.userId, session.id)));
  if (!existing) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  if (updates.isDefault === true) {
    const displayClientMatch = existing.displayClient
      ? sql`${workspaceSnapshots.displayClient} = ${existing.displayClient}`
      : sql`${workspaceSnapshots.displayClient} IS NULL`;
    await db
      .update(workspaceSnapshots)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceSnapshots.userId, session.id),
          eq(workspaceSnapshots.provider, existing.provider),
          eq(workspaceSnapshots.experience, existing.experience),
          displayClientMatch,
          eq(workspaceSnapshots.sizeProfile, existing.sizeProfile),
        ),
      );
  }

  const [updated] = await db
    .update(workspaceSnapshots)
    .set(updates)
    .where(and(eq(workspaceSnapshots.id, id), eq(workspaceSnapshots.userId, session.id)))
    .returning();

  return NextResponse.json({ snapshot: updated });
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
  const [updated] = await db
    .update(workspaceSnapshots)
    .set({ status: "archived", isDefault: false, updatedAt: new Date() })
    .where(and(eq(workspaceSnapshots.id, id), eq(workspaceSnapshots.userId, session.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
