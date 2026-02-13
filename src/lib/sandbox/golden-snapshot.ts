import { db } from "@/lib/db/client";
import { config } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { WorkspaceExperience } from "@/types/workspace";

function getSnapshotKey(experience: WorkspaceExperience): string {
  return experience === "cli"
    ? "golden_snapshot_cli_id"
    : "golden_snapshot_gui_id";
}

export async function getGoldenSnapshotId(
  experience: WorkspaceExperience = "gui",
): Promise<string | null> {
  const key = getSnapshotKey(experience);
  const [row] = await db
    .select()
    .from(config)
    .where(eq(config.key, key));
  return row?.value ?? null;
}

export async function setGoldenSnapshotId(
  snapshotId: string,
  experience: WorkspaceExperience = "gui",
): Promise<void> {
  const key = getSnapshotKey(experience);
  await db
    .insert(config)
    .values({
      key,
      value: snapshotId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: snapshotId, updatedAt: new Date() },
    });
}
