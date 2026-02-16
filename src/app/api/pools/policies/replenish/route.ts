import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { replenishPoolForPolicy, replenishPoolForUser } from "@/lib/sandbox/warm-pool";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const policyId = typeof body.policyId === "string" ? body.policyId : null;

  try {
    const result = policyId
      ? await replenishPoolForPolicy(session.id, policyId)
      : await replenishPoolForUser(session.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to replenish pool" },
      { status: 500 },
    );
  }
}
