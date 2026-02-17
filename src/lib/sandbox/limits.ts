export const WORKSPACE_LIMITS: Record<string, number> = {
  guest: 1,
  user: 3,
  admin: Infinity,
};

export const MIN_SANDBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_SANDBOX_TIMEOUT_MS = 45 * 60 * 1000; // safe default across plans
export const MAX_SANDBOX_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours max on eligible plans

export const SANDBOX_TIMEOUT_PRESETS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  45 * 60 * 1000,
  60 * 60 * 1000,
  2 * 60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  5 * 60 * 60 * 1000,
] as const;
