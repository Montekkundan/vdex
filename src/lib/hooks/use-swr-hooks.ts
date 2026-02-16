"use client";

import useSWR, { mutate } from "swr";
import useSWRImmutable from "swr/immutable";
import type { Workspace } from "@/types/workspace";
import type { SandboxInfo } from "@/types/sandbox";
import type { DesktopEntry } from "@/types/desktop-entry";
import { fetcher, SWR_KEYS } from "@/lib/swr";
import { sandboxServiceFetcher } from "@/lib/hooks/use-sandbox-service-client";
import { useActiveSandbox } from "@/stores/workspace-store";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface VercelAccountInfo {
  providerAccountId: string;
  scope: string | null;
  connectedAt: string;
}

interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role: "user" | "admin" | "guest";
  workspaceLimit: number | null;
  vercelConnected: boolean;
  vercelAccount: VercelAccountInfo | null;
}

export interface UserSnapshot {
  id: string;
  userId: string;
  provider: string;
  experience: string;
  displayClient: string | null;
  sizeProfile: string;
  name: string;
  description: string | null;
  snapshotId: string;
  sourceWorkspaceId: string | null;
  sourceType: "capture" | "script";
  installScript: string | null;
  status: "ready" | "building" | "failed" | "archived";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlatformDefaultSnapshot {
  id: string;
  provider: string;
  experience: string;
  displayClient: string;
  sizeProfile: string;
  defaultSnapshotId: string;
  updatedAt: string;
}

interface SnapshotsResponse {
  snapshots: UserSnapshot[];
  platformDefaults: PlatformDefaultSnapshot[];
  fallbackDefaults: {
    gui: string | null;
    cli: string | null;
  };
  limits: {
    maxSnapshotsPerUser: number;
  };
}

export interface UserPoolPolicy {
  id: string;
  userId: string;
  name: string;
  provider: string;
  experience: string;
  displayClient: string;
  sizeProfile: string;
  snapshotRefType: "platform_default" | "user_snapshot";
  snapshotRefId: string | null;
  target: number;
  enabled: boolean;
  availableCount: number;
  claimedCount: number;
  maxAgeMinutes: number;
  createdAt: string;
  updatedAt: string;
}

interface PoolPoliciesResponse {
  policies: UserPoolPolicy[];
  stats: {
    available: number;
    claimed: number;
    expired: number;
  };
  expiredEntries: Array<{
    id: string;
    policyId: string | null;
    sandboxId: string;
    snapshotId: string;
    status: "expired";
    claimedAt: string | null;
    createdAt: string;
  }>;
  limits: {
    maxSnapshotsPerUser: number;
    maxPoolBucketsPerUser: number;
    maxWarmEntriesPerUserTotal: number;
    maxTargetPerBucket: number;
    defaultMaxAgeMinutes: number;
  };
}

export function useUser() {
  const { data, error, isLoading } = useSWR<AuthUser>(
    SWR_KEYS.user,
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  return {
    user: data ?? null,
    isLoading,
    error: error as Error | undefined,
  };
}

export function useSnapshots(enabled = true) {
  const { data, error, isLoading, isValidating } = useSWR<SnapshotsResponse>(
    enabled ? SWR_KEYS.snapshots : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  return {
    snapshots: data?.snapshots ?? [],
    platformDefaults: data?.platformDefaults ?? [],
    fallbackDefaults: data?.fallbackDefaults ?? { gui: null, cli: null },
    limits: data?.limits ?? { maxSnapshotsPerUser: 10 },
    isLoading,
    isValidating,
    error: error as Error | undefined,
  };
}

export function mutateSnapshots() {
  return mutate(SWR_KEYS.snapshots);
}

export function usePoolPolicies(enabled = true) {
  const { data, error, isLoading, isValidating } =
    useSWR<PoolPoliciesResponse>(
      enabled ? SWR_KEYS.poolPolicies : null,
      fetcher,
      { revalidateOnFocus: true },
    );

  return {
    policies: data?.policies ?? [],
    stats: data?.stats ?? { available: 0, claimed: 0, expired: 0 },
    expiredEntries: data?.expiredEntries ?? [],
    limits:
      data?.limits ??
      ({
        maxSnapshotsPerUser: 10,
        maxPoolBucketsPerUser: 3,
        maxWarmEntriesPerUserTotal: 10,
        maxTargetPerBucket: 5,
        defaultMaxAgeMinutes: 45,
      } as const),
    isLoading,
    isValidating,
    error: error as Error | undefined,
  };
}

export function mutatePoolPolicies() {
  return mutate(SWR_KEYS.poolPolicies);
}

export async function createPoolPolicyMutate(payload: {
  name?: string;
  provider: string;
  experience: string;
  displayClient: string;
  sizeProfile: string;
  snapshotRefType: "platform_default" | "user_snapshot";
  snapshotRefId?: string | null;
  target: number;
  enabled?: boolean;
  maxAgeMinutes?: number;
}) {
  const res = await fetch("/api/pools/policies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to create pool policy");
  }
  await mutatePoolPolicies();
  return body.policy as UserPoolPolicy;
}

export async function updatePoolPolicyMutate(
  id: string,
  payload: { name?: string; target?: number; enabled?: boolean; maxAgeMinutes?: number },
) {
  const res = await fetch(`/api/pools/policies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to update pool policy");
  }
  await mutatePoolPolicies();
  return body.policy as UserPoolPolicy;
}

export async function deletePoolPolicyMutate(id: string) {
  const res = await fetch(`/api/pools/policies/${id}`, {
    method: "DELETE",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to delete pool policy");
  }
  await mutatePoolPolicies();
}

export async function replenishPoolPoliciesMutate(policyId?: string) {
  const res = await fetch("/api/pools/policies/replenish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policyId ? { policyId } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to replenish warm pool");
  }
  await mutatePoolPolicies();
  return body.result as { created: number; failed: number; errors: string[] };
}

export async function createSnapshotMutate(payload: {
  name: string;
  description?: string;
  snapshotId: string;
  provider?: string;
  experience?: string;
  displayClient?: string;
  sizeProfile?: string;
}) {
  const res = await fetch("/api/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to create snapshot");
  await mutateSnapshots();
  return body.snapshot as UserSnapshot;
}

export async function captureSnapshotMutate(payload: {
  workspaceId: string;
  name: string;
  description?: string;
}) {
  const res = await fetch("/api/snapshots/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to capture snapshot");
  await mutateSnapshots();
  return body.snapshot as UserSnapshot;
}

export async function buildSnapshotMutate(payload: {
  name: string;
  installScript: string;
  description?: string;
  experience?: "gui" | "cli";
}) {
  const res = await fetch("/api/snapshots/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to build snapshot");
  await mutateSnapshots();
  return body.snapshot as UserSnapshot;
}

export async function updateSnapshotMutate(
  id: string,
  payload: { name?: string; description?: string; isDefault?: boolean },
) {
  const res = await fetch(`/api/snapshots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to update snapshot");
  await mutateSnapshots();
  return body.snapshot as UserSnapshot;
}

export async function deleteSnapshotMutate(id: string) {
  const res = await fetch(`/api/snapshots/${id}`, {
    method: "DELETE",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Failed to delete snapshot");
  await mutateSnapshots();
}

export async function loginMutate(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error);
  }
  const user = await res.json();
  await mutate(SWR_KEYS.user, user, { revalidate: false });
  return user as AuthUser;
}

export async function signupMutate(
  email: string,
  password: string,
  name?: string,
) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error);
  }
  const user = await res.json();
  await mutate(SWR_KEYS.user, user, { revalidate: false });
  return user as AuthUser;
}

export async function logoutMutate() {
  await fetch("/api/auth/logout", { method: "POST" });
  await mutate(SWR_KEYS.user, null, { revalidate: false });
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

interface WorkspacesResponse {
  workspaces: Workspace[];
}

const EMPTY_WORKSPACES: Workspace[] = [];

export function useWorkspaces(enabled = true) {
  const { data, error, isLoading, isValidating } =
    useSWR<WorkspacesResponse>(
      enabled ? SWR_KEYS.workspaces : null,
      fetcher,
      { revalidateOnFocus: true, dedupingInterval: 2000 },
    );
  return {
    workspaces: data?.workspaces ?? EMPTY_WORKSPACES,
    isLoading,
    isValidating,
    error: error as Error | undefined,
  };
}

export function mutateWorkspaces() {
  return mutate(SWR_KEYS.workspaces);
}

// ---------------------------------------------------------------------------
// Single workspace + sandbox info
// ---------------------------------------------------------------------------

interface WorkspaceResponse {
  workspace: Workspace;
  sandbox: SandboxInfo | null;
  servicesReady?: boolean;
  displayReady?: boolean;
  sandboxLost?: boolean;
  canRecover?: boolean;
}

export function useWorkspace(id: string | null) {
  const { data, error, isLoading } = useSWR<WorkspaceResponse>(
    id ? SWR_KEYS.workspace(id) : null,
    fetcher,
    { revalidateOnFocus: true, dedupingInterval: 2000, refreshInterval: 60_000 },
  );
  return {
    workspace: data?.workspace ?? null,
    sandbox: data?.sandbox ?? null,
    servicesReady: data?.servicesReady ?? false,
    displayReady: data?.displayReady ?? false,
    sandboxLost: data?.sandboxLost ?? false,
    canRecover: data?.canRecover ?? false,
    isLoading,
    error: error as Error | undefined,
  };
}

export function mutateWorkspace(id: string) {
  return mutate(SWR_KEYS.workspace(id));
}

// ---------------------------------------------------------------------------
// Window state
// ---------------------------------------------------------------------------

interface WindowsResponse {
  windows: unknown[];
}

export function useWindowState(workspaceId: string | null) {
  const { data, error, isLoading } = useSWRImmutable<WindowsResponse>(
    workspaceId ? SWR_KEYS.windows(workspaceId) : null,
    fetcher,
  );
  return {
    windows: data?.windows ?? null,
    isLoading,
    error: error as Error | undefined,
  };
}

// ---------------------------------------------------------------------------
// Desktop entries (from sandbox services, not Next.js API)
// ---------------------------------------------------------------------------

interface DesktopEntriesResponse {
  entries: DesktopEntry[];
  desktopShortcuts: DesktopEntry[];
  apps: DesktopEntry[];
}

function isLocalhostBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  );
}

function buildServiceKey(
  workspaceId: string | null,
  servicesDomain: string | null,
  path: string,
): string | null {
  if (!servicesDomain) return null;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isLocalhostBrowser() && workspaceId) {
    return `/api/sandbox/${workspaceId}/service${normalizedPath}`;
  }
  return `https://${servicesDomain}${normalizedPath}`;
}

export function useDesktopEntries(servicesDomain: string | null) {
  const { activeWorkspaceId } = useActiveSandbox();
  const { data, error, isLoading } = useSWRImmutable<DesktopEntriesResponse>(
    buildServiceKey(activeWorkspaceId, servicesDomain, "/desktop-entries"),
    sandboxServiceFetcher,
  );
  return { data: data ?? null, isLoading, error: error as Error | undefined };
}

// ---------------------------------------------------------------------------
// File manager directory listing
// ---------------------------------------------------------------------------

interface DirectoryListingResponse {
  items: FileEntry[];
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export function useDirectoryListing(
  servicesDomain: string | null,
  path: string,
) {
  const { activeWorkspaceId } = useActiveSandbox();
  const key = buildServiceKey(
    activeWorkspaceId,
    servicesDomain,
    `/files/list?path=${encodeURIComponent(path)}`,
  );
  const { data, error, isLoading, isValidating, mutate: revalidate } =
    useSWR<DirectoryListingResponse>(key, sandboxServiceFetcher, {
      revalidateOnFocus: false,
      dedupingInterval: 1000,
    });
  return {
    entries: data?.items ?? [],
    isLoading,
    isValidating,
    error: error as Error | undefined,
    revalidate,
  };
}
