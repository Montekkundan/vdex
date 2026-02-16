import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { getSandbox } from "@/lib/sandbox/client";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      shareEnabled: workspaces.shareEnabled,
      shareId: workspaces.shareId,
      sandboxId: workspaces.sandboxId,
      status: workspaces.status,
      experience: workspaces.experience,
      displayClient: workspaces.displayClient,
    })
    .from(workspaces)
    .where(and(eq(workspaces.shareId, id), eq(workspaces.shareEnabled, true)))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  if (!workspace.sandboxId || workspace.status !== "active") {
    return NextResponse.json({ error: "Workspace is not running" }, { status: 409 });
  }

  try {
    const sandbox = await getSandbox(workspace.sandboxId);
    if (!isLiveSandboxStatus(sandbox.status)) {
      return NextResponse.json({ error: "Workspace is not running" }, { status: 409 });
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        experience: workspace.experience,
        displayClient: workspace.displayClient,
      },
      sandbox: {
        domains: sandbox.domains,
        status: sandbox.status,
      },
    });
  } catch {
    return NextResponse.json({ error: "Workspace is unavailable" }, { status: 503 });
  }
}
