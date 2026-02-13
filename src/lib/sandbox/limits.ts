export const WORKSPACE_LIMITS: Record<string, number> = {
  guest: 1,
  user: 3,
  admin: Infinity,
};

export const MAX_SANDBOX_LIFETIME_MS = 45 * 60 * 1000; // 45 minutes max (Vercel cap)
