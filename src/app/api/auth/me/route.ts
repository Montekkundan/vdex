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
  preferred_username?: string;
}

interface IdTokenClaims {
  email?: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

function parseJwtClaims(token: string | null | undefined): IdTokenClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload) as IdTokenClaims;
  } catch {
    return null;
  }
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
      idToken: accounts.idToken,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(
      and(eq(accounts.userId, session.id), eq(accounts.provider, "vercel")),
    );

  const workspaceLimit = WORKSPACE_LIMITS[session.role] ?? WORKSPACE_LIMITS.user;
  let profile: VercelUserInfo | null = null;
  const idTokenClaims = parseJwtClaims(vercelAccount?.idToken);

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

  const resolvedEmail = session.email ?? profile?.email ?? idTokenClaims?.email ?? null;
  const resolvedName = session.name ?? profile?.name ?? idTokenClaims?.name ?? null;
  const resolvedImage =
    profile?.picture ??
    idTokenClaims?.picture ??
    (resolvedEmail
      ? `https://avatar.vercel.sh/${encodeURIComponent(resolvedEmail)}`
      : vercelAccount?.providerAccountId
        ? `https://avatar.vercel.sh/${encodeURIComponent(vercelAccount.providerAccountId)}`
        : null);

  return NextResponse.json({
    ...session,
    name: resolvedName,
    email: resolvedEmail,
    image: resolvedImage,
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
