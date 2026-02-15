import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getUserDiagnostics } from "@/lib/admin/ops";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [diagnostics, userWorkspaces] = await Promise.all([
    getUserDiagnostics(id),
    db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, id))
      .orderBy(workspaces.updatedAt)
      .limit(100),
  ]);

  return NextResponse.json({
    userId: id,
    launches: diagnostics.launches,
    apiFailures: diagnostics.failures,
    workspaces: userWorkspaces,
  });
}
