import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  platformDefaults,
  workspaceSnapshots,
  type WorkspaceSnapshotRow,
} from "@/lib/db/schema";
import { getGoldenSnapshotId } from "@/lib/sandbox/golden-snapshot";
import type {
  DisplayClient,
  ProviderId,
  SizeProfileId,
  WorkspaceExperience,
} from "@/types/workspace";
import type { SnapshotSource } from "@/lib/pools/constants";

interface ResolveSnapshotSourceInput {
  userId: string;
  provider: ProviderId;
  experience: WorkspaceExperience;
  displayClient: DisplayClient;
  sizeProfile: SizeProfileId;
  snapshotSource?: SnapshotSource;
  snapshotRefId?: string;
  explicitSnapshotId?: string;
}

export interface ResolvedSnapshotSource {
  snapshotId: string | undefined;
  snapshotRefType: "platform_default" | "user_snapshot";
  snapshotRefId: string | null;
  snapshotRecord: WorkspaceSnapshotRow | null;
}

export async function resolveSnapshotSource(
  input: ResolveSnapshotSourceInput,
): Promise<ResolvedSnapshotSource> {
  if (input.explicitSnapshotId) {
    return {
      snapshotId: input.explicitSnapshotId,
      snapshotRefType: "platform_default",
      snapshotRefId: null,
      snapshotRecord: null,
    };
  }

  const source = input.snapshotSource ?? "platform_default";

  if (source === "user_snapshot") {
    if (!input.snapshotRefId) {
      throw new Error("snapshotRefId is required for user_snapshot source");
    }
    const [snapshot] = await db
      .select()
      .from(workspaceSnapshots)
      .where(
        and(
          eq(workspaceSnapshots.id, input.snapshotRefId),
          eq(workspaceSnapshots.userId, input.userId),
          eq(workspaceSnapshots.status, "ready"),
        ),
      );
    if (!snapshot) {
      throw new Error("Snapshot not found or not ready");
    }
    return {
      snapshotId: snapshot.snapshotId,
      snapshotRefType: "user_snapshot",
      snapshotRefId: snapshot.id,
      snapshotRecord: snapshot,
    };
  }

  const [platformDefault] = await db
    .select()
    .from(platformDefaults)
    .where(
      and(
        eq(platformDefaults.provider, input.provider),
        eq(platformDefaults.experience, input.experience),
        eq(platformDefaults.displayClient, input.displayClient),
        eq(platformDefaults.sizeProfile, input.sizeProfile),
      ),
    );

  if (platformDefault) {
    return {
      snapshotId: platformDefault.defaultSnapshotId,
      snapshotRefType: "platform_default",
      snapshotRefId: null,
      snapshotRecord: null,
    };
  }

  const goldenSnapshotId = await getGoldenSnapshotId(input.experience);
  return {
    snapshotId: goldenSnapshotId || undefined,
    snapshotRefType: "platform_default",
    snapshotRefId: null,
    snapshotRecord: null,
  };
}
