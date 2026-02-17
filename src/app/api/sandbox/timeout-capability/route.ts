import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { getSession } from "@/lib/auth/session";
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  MAX_SANDBOX_TIMEOUT_MS,
} from "@/lib/sandbox/limits";

function indicatesLowerPlanTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") &&
    (msg.includes("2700000") || msg.includes("45") || msg.includes("45m") || msg.includes("45 minutes"))
  );
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({
      runtime: "node24",
      timeout: MAX_SANDBOX_TIMEOUT_MS,
    });

    return NextResponse.json({
      maxTimeoutMs: MAX_SANDBOX_TIMEOUT_MS,
      detectionMethod: "probe",
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const maxTimeoutMs = indicatesLowerPlanTimeout(err)
      ? DEFAULT_SANDBOX_TIMEOUT_MS
      : DEFAULT_SANDBOX_TIMEOUT_MS;

    return NextResponse.json({
      maxTimeoutMs,
      detectionMethod: "probe",
      checkedAt: new Date().toISOString(),
      fallback: true,
    });
  } finally {
    if (sandbox) {
      await sandbox.stop().catch(() => undefined);
    }
  }
}

