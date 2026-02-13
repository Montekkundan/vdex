import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq, count, inArray, and } from "drizzle-orm";
import { getGoldenSnapshotId } from "@/lib/sandbox/golden-snapshot";
import {
  claimWarmVM,
  triggerBackgroundReplenish,
} from "@/lib/sandbox/warm-pool";
import { WORKSPACE_ICON_NAMES, generateWorkspaceName } from "@/types/workspace";
import { getProviderDriver } from "@/lib/runtime/providers";
import { ProviderRuntimeError } from "@/lib/runtime/providers/types";
import {
  validateDisplayClient,
  validateProvider,
  validateSizeProfile,
  validateWorkspaceExperience,
  type CreateValidationErrorCode,
} from "@/lib/runtime/validation";
import { WORKSPACE_LIMITS } from "@/lib/sandbox/limits";
import { enforceRateLimit, RATE_LIMIT_IDS } from "@/lib/rate-limit";

type CreateWorkspaceBody = {
  name?: string;
  icon?: string;
  snapshotId?: string;
  workspaceId?: string;
  provider?: unknown;
  experience?: unknown;
  displayClient?: unknown;
  sizeProfile?: unknown;
};

function createErrorResponse(
  error: CreateValidationErrorCode | string,
  message: string,
  status = 400,
) {
  return NextResponse.json({ error, message }, { status });
}

function toProviderErrorResponse(err: unknown) {
  if (err instanceof ProviderRuntimeError) {
    return createErrorResponse(err.code, err.message);
  }

  return null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimited = await enforceRateLimit(
    RATE_LIMIT_IDS.sandboxCreate,
    req,
    session.id,
    session.role,
  );
  if (rateLimited) return rateLimited;

  const ipRateLimited = await enforceRateLimit(
    RATE_LIMIT_IDS.sandboxCreateIp,
    req,
    undefined,
    session.role,
  );
  if (ipRateLimited) return ipRateLimited;

  try {
    const body = (await req.json()) as CreateWorkspaceBody;
    const {
      name,
      icon,
      snapshotId: explicitSnapshotId,
      workspaceId,
    } = body;

    // ---- Reconnect path: reuse an existing workspace row ----
    if (workspaceId) {
      const [existingWorkspace] = await db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.userId, session.id),
          ),
        );

      if (!existingWorkspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const resolvedProvider = validateProvider(existingWorkspace.provider);
      if (!resolvedProvider.ok) {
        return createErrorResponse(
          resolvedProvider.error.code,
          resolvedProvider.error.message,
        );
      }

      const resolvedDisplayClient = validateDisplayClient(
        existingWorkspace.displayClient,
      );
      if (!resolvedDisplayClient.ok) {
        return createErrorResponse(
          resolvedDisplayClient.error.code,
          resolvedDisplayClient.error.message,
        );
      }

      const resolvedSize = validateSizeProfile(existingWorkspace.sizeProfile);
      if (!resolvedSize.ok) {
        return createErrorResponse(
          resolvedSize.error.code,
          resolvedSize.error.message,
        );
      }

      const resolvedExperience = validateWorkspaceExperience(
        existingWorkspace.experience ?? "gui",
      );
      if (!resolvedExperience.ok) {
        return createErrorResponse(
          resolvedExperience.error.code,
          resolvedExperience.error.message,
        );
      }

      const snapshotId =
        explicitSnapshotId ||
        existingWorkspace.snapshotId ||
        (await getGoldenSnapshotId(resolvedExperience.value)) ||
        undefined;

      let sandbox =
        resolvedProvider.value === "vercel" &&
        !explicitSnapshotId &&
        resolvedExperience.value === "gui" &&
        resolvedDisplayClient.value === "xpra" &&
        existingWorkspace.sizeProfile === "balanced_4c8g"
          ? await claimWarmVM()
          : null;

      if (!sandbox) {
        try {
          const driver = getProviderDriver(resolvedProvider.value);
          sandbox = await driver.createWorkspaceRuntime({
            snapshotId,
            resources: {
              vcpus: resolvedSize.value.vcpu,
              memoryGb: resolvedSize.value.memoryGb,
            },
            displayClient: resolvedDisplayClient.value,
            experience: resolvedExperience.value,
          });
        } catch (err) {
          const providerError = toProviderErrorResponse(err);
          if (providerError) return providerError;
          throw err;
        }
      }

      if (resolvedProvider.value === "vercel") {
        const h = await headers();
        const host = h.get("host");
        const proto = h.get("x-forwarded-proto") || "https";
        if (host) triggerBackgroundReplenish(`${proto}://${host}`);
      }

      const [updated] = await db
        .update(workspaces)
        .set({
          sandboxId: sandbox.sandboxId,
          snapshotId: snapshotId || existingWorkspace.snapshotId,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId))
        .returning();

      const fallback = "fallback" in sandbox ? (sandbox.fallback ?? false) : false;
      return NextResponse.json({ workspace: updated, sandbox, fallback });
    }

    // ---- Normal create path: new workspace ----

    // Enforce per-user workspace limit (only count workspaces consuming resources)
    const limit = WORKSPACE_LIMITS[session.role] ?? WORKSPACE_LIMITS.user;
    if (limit !== Infinity) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.userId, session.id),
            inArray(workspaces.status, ["active", "creating"]),
          ),
        );
      if (total >= limit) {
        return NextResponse.json(
          {
            error: "Workspace limit reached",
            limit,
            current: total,
            isGuest: session.role === "guest",
          },
          { status: 429 },
        );
      }
    }

    const providerInput = body.provider ?? "vercel";
    const experienceInput = body.experience ?? "gui";
    const displayClientInput = body.displayClient ?? "xpra";
    const sizeProfileInput = body.sizeProfile ?? "balanced_4c8g";

    const resolvedProvider = validateProvider(providerInput);
    if (!resolvedProvider.ok) {
      return createErrorResponse(
        resolvedProvider.error.code,
        resolvedProvider.error.message,
      );
    }

    const resolvedExperience = validateWorkspaceExperience(experienceInput);
    if (!resolvedExperience.ok) {
      return createErrorResponse(
        resolvedExperience.error.code,
        resolvedExperience.error.message,
      );
    }

    const resolvedDisplayClient = validateDisplayClient(displayClientInput);
    if (!resolvedDisplayClient.ok) {
      return createErrorResponse(
        resolvedDisplayClient.error.code,
        resolvedDisplayClient.error.message,
      );
    }

    const resolvedSize = validateSizeProfile(sizeProfileInput);
    if (!resolvedSize.ok) {
      return createErrorResponse(
        resolvedSize.error.code,
        resolvedSize.error.message,
      );
    }

    const randomIcon = WORKSPACE_ICON_NAMES[Math.floor(Math.random() * WORKSPACE_ICON_NAMES.length)];
    let wsName = name || generateWorkspaceName();

    // Ensure unique name per user (for URL slugs)
    const existing = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.userId, session.id));
    const existingNames = new Set(existing.map((w) => w.name.toLowerCase()));
    if (existingNames.has(wsName.toLowerCase())) {
      let suffix = 2;
      while (existingNames.has(`${wsName} ${suffix}`.toLowerCase())) suffix++;
      wsName = `${wsName} ${suffix}`;
    }

    // Start DB insert and snapshot lookup in parallel
    const [insertResult, goldenSnapshotId] = await Promise.all([
      db
        .insert(workspaces)
        .values({
          userId: session.id,
          name: wsName,
          icon: icon || randomIcon,
          provider: resolvedProvider.value,
          experience: resolvedExperience.value,
          displayClient: resolvedDisplayClient.value,
          sizeProfile: resolvedSize.value.id,
          status: "creating",
        })
        .returning(),
      explicitSnapshotId
        ? Promise.resolve(explicitSnapshotId)
        : getGoldenSnapshotId(resolvedExperience.value),
    ]);

    const [workspace] = insertResult;
    const snapshotId = explicitSnapshotId || goldenSnapshotId || undefined;

    let sandbox;
    try {
      // Try to claim a pre-warmed VM from the pool (only for default vercel profile)
      sandbox =
        resolvedProvider.value === "vercel" &&
        !explicitSnapshotId &&
        resolvedExperience.value === "gui" &&
        resolvedDisplayClient.value === "xpra" &&
        resolvedSize.value.id === "balanced_4c8g"
          ? await claimWarmVM()
          : null;

      if (!sandbox) {
        const driver = getProviderDriver(resolvedProvider.value);
        sandbox = await driver.createWorkspaceRuntime({
          snapshotId,
          resources: {
            vcpus: resolvedSize.value.vcpu,
            memoryGb: resolvedSize.value.memoryGb,
          },
          displayClient: resolvedDisplayClient.value,
          experience: resolvedExperience.value,
        });
      }
    } catch (provisionErr) {
      // Clean up the orphaned workspace row so it doesn't count toward limits
      await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

      const providerError = toProviderErrorResponse(provisionErr);
      if (providerError) return providerError;

      console.error("Sandbox provisioning failed, cleaned up workspace row:", provisionErr);
      return NextResponse.json(
        { error: "Failed to create sandbox" },
        { status: 500 },
      );
    }

    // Trigger background replenish (ISR-style: don't block the response)
    if (resolvedProvider.value === "vercel") {
      const h = await headers();
      const host = h.get("host");
      const proto = h.get("x-forwarded-proto") || "https";
      if (host) {
        triggerBackgroundReplenish(`${proto}://${host}`);
      }
    }

    const [updated] = await db
      .update(workspaces)
      .set({
        sandboxId: sandbox.sandboxId,
        snapshotId: snapshotId ?? null,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspace.id))
      .returning();

    return NextResponse.json({
      workspace: updated,
      sandbox,
      fallback: "fallback" in sandbox ? (sandbox.fallback ?? false) : false,
    });
  } catch (err) {
    console.error("Create sandbox error:", err);
    return NextResponse.json(
      { error: "Failed to create sandbox" },
      { status: 500 },
    );
  }
}
