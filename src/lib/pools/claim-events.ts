import { db } from "@/lib/db/client";
import { poolClaimEvents } from "@/lib/db/schema";
import type { DisplayClient, ProviderId, SizeProfileId, WorkspaceExperience } from "@/types/workspace";

interface LogPoolClaimEventInput {
  entryId?: string | null;
  userId: string;
  workspaceId?: string | null;
  provider: ProviderId;
  experience: WorkspaceExperience;
  displayClient: DisplayClient;
  sizeProfile: SizeProfileId;
  snapshotRefType: "platform_default" | "user_snapshot";
  snapshotRefId?: string | null;
  result: "hit" | "miss" | "stale" | "fallback";
  reason?: string | null;
}

export async function logPoolClaimEvent(input: LogPoolClaimEventInput) {
  await db.insert(poolClaimEvents).values({
    entryId: input.entryId ?? null,
    userId: input.userId,
    workspaceId: input.workspaceId ?? null,
    provider: input.provider,
    experience: input.experience,
    displayClient: input.displayClient,
    sizeProfile: input.sizeProfile,
    snapshotRefType: input.snapshotRefType,
    snapshotRefId: input.snapshotRefId ?? null,
    result: input.result,
    reason: input.reason ?? null,
  });
}
