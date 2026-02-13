/**
 * Returns true when a sandbox status should be treated as live/running.
 * Vercel may return a non-running sandbox (for example "stopped")
 * without throwing on Sandbox.get.
 */
export function isLiveSandboxStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === "running" || normalized === "active";
}

