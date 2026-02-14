import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { WORKSPACE_LIMITS } from "@/lib/sandbox/limits";

interface VercelUserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [vercelAccount] = await db
    .select({
      provider: accounts.provider,
      providerAccountId: accounts.providerAccountId,
      scope: accounts.scope,
      accessToken: accounts.accessToken,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(
      and(eq(accounts.userId, session.id), eq(accounts.provider, "vercel")),
    );

  const workspaceLimit = WORKSPACE_LIMITS[session.role] ?? WORKSPACE_LIMITS.user;
  let profile: VercelUserInfo | null = null;

  if (vercelAccount?.accessToken) {
    try {
      const infoRes = await fetch("https://api.vercel.com/login/oauth/userinfo", {
        headers: { Authorization: `Bearer ${vercelAccount.accessToken}` },
        cache: "no-store",
      });
      if (infoRes.ok) {
        profile = (await infoRes.json()) as VercelUserInfo;
      }
    } catch {
      profile = null;
    }
  }

  return NextResponse.json({
    ...session,
    name: session.name ?? profile?.name ?? null,
    email: session.email ?? profile?.email ?? null,
    image: profile?.picture ?? null,
    workspaceLimit: workspaceLimit === Infinity ? null : workspaceLimit,
    vercelConnected: !!vercelAccount,
    vercelAccount: vercelAccount
      ? {
        providerAccountId: vercelAccount.providerAccountId,
          scope: vercelAccount.scope,
          connectedAt: vercelAccount.createdAt,
        }
      : null,
  });
}
