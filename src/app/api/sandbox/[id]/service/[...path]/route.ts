import { NextResponse } from "next/server";
import { getAuthedWorkspace } from "@/lib/api/get-authed-workspace";
import { getSandbox } from "@/lib/sandbox/client";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

function normalizeServicePath(pathParts: string[]): string {
  const joined = pathParts.join("/");
  return `/${joined.replace(/^\/+/, "")}`;
}

async function forward(
  req: Request,
  params: Promise<{ id: string; path: string[] }>,
  method: "GET" | "POST",
) {
  const result = await getAuthedWorkspace(
    params as Promise<{ id: string }>,
  );
  if (result instanceof NextResponse) return result;

  const { workspace } = result;
  if (!workspace.sandboxId) {
    return NextResponse.json({ error: "No active sandbox" }, { status: 400 });
  }

  const sandbox = await getSandbox(workspace.sandboxId);
  if (!isLiveSandboxStatus(sandbox.status)) {
    return NextResponse.json({ error: "Sandbox is not running" }, { status: 410 });
  }

  const { path } = await params;
  const servicePath = normalizeServicePath(path);
  const inbound = new URL(req.url);
  const target = new URL(`https://${sandbox.domains.services}${servicePath}`);
  target.search = inbound.search;

  const init: RequestInit = { method };
  if (method === "POST") {
    const contentType = req.headers.get("content-type") ?? "application/json";
    init.headers = { "content-type": contentType };
    init.body = await req.text();
  }

  const res = await fetch(target.toString(), init);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": contentType || "text/plain; charset=utf-8" },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  return forward(req, params, "GET");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> },
) {
  return forward(req, params, "POST");
}

