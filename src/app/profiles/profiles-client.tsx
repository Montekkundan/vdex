"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildSnapshotMutate,
  captureSnapshotMutate,
  createPoolPolicyMutate,
  deletePoolPolicyMutate,
  deleteSnapshotMutate,
  updatePoolPolicyMutate,
  updateSnapshotMutate,
  usePoolPolicies,
  useSnapshots,
  useWorkspaces,
} from "@/lib/hooks/use-swr-hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/layout/page-header";
import { AppPageFooter } from "@/components/layout/app-page-footer";
import {
  SIZE_PROFILES,
  DISPLAY_CLIENTS,
  EXPERIENCES,
  PROVIDERS,
} from "@/lib/runtime/profiles";
import { Info } from "lucide-react";
import { captureEvent } from "@/lib/observability/client";

const GUI_APP_TEMPLATES: Array<{ id: string; label: string; script: string }> =
  [
    {
      id: "firefox",
      label: "Firefox",
      script: "sudo dnf install -y firefox",
    },
    {
      id: "nautilus",
      label: "Files (Nautilus)",
      script: "sudo dnf install -y nautilus",
    },
    {
      id: "calculator",
      label: "Calculator",
      script: "sudo dnf install -y gnome-calculator",
    },
    {
      id: "text-editor",
      label: "Text Editor",
      script: "sudo dnf install -y gnome-text-editor",
    },
    {
      id: "gimp",
      label: "GIMP",
      script: "sudo dnf install -y gimp",
    },
  ];

export function ProfilesClient() {
  const { snapshots, limits, isLoading: snapshotsLoading } = useSnapshots(true);
  const {
    policies,
    stats,
    limits: policyLimits,
    isLoading: policiesLoading,
  } = usePoolPolicies(true);
  const { workspaces } = useWorkspaces(true);

  const [captureName, setCaptureName] = useState("");
  const [captureWorkspaceId, setCaptureWorkspaceId] = useState<string>("");
  const [captureDescription, setCaptureDescription] = useState("");
  const [buildName, setBuildName] = useState("");
  const [buildDescription, setBuildDescription] = useState("");
  const [buildExperience, setBuildExperience] = useState<"gui" | "cli">("gui");
  const [buildScript, setBuildScript] = useState("");
  const [guiTemplate, setGuiTemplate] = useState("");
  const [policyProvider] = useState("vercel");
  const [policyExperience, setPolicyExperience] = useState("gui");
  const [policyDisplayClient] = useState("xpra");
  const [policySizeProfile, setPolicySizeProfile] = useState("balanced_4c8g");
  const [policyTarget, setPolicyTarget] = useState("1");
  const [policySourceType, setPolicySourceType] = useState<
    "platform_default" | "user_snapshot"
  >("platform_default");
  const [policySnapshotRefId, setPolicySnapshotRefId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const readySnapshots = useMemo(
    () => snapshots.filter((s) => s.status === "ready"),
    [snapshots],
  );
  const runningWorkspaces = useMemo(
    () => workspaces.filter((w) => w.status === "active" && !!w.sandboxId),
    [workspaces],
  );

  async function runWithState(key: string, fn: () => Promise<void>) {
    const startedAt = Date.now();
    setError(null);
    setBusy(key);
    try {
      await fn();
      captureEvent("profiles_action_succeeded", {
        key,
        latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      captureEvent("profiles_action_failed", {
        key,
        errorMessage: message,
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      setBusy(null);
    }
  }

  function appendGuiTemplate(templateId: string) {
    const template = GUI_APP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setBuildScript((prev) =>
      prev.trim() ? `${prev}\n${template.script}` : template.script,
    );
  }

  if (snapshotsLoading || policiesLoading) {
    return (
      <main className="min-h-screen bg-background-100">
        <div className="mx-auto flex min-h-screen w-full max-w-[var(--container-max-width)] items-center justify-center border-x border-dashed border-gray-alpha-300">
          <Spinner size="lg" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--container-max-width)] flex-col border-x border-dashed border-gray-alpha-300">
        <div className="flex-1 py-6 sm:py-8">
          <div className="space-y-6">
            <PageHeader
              title="Profiles"
              description="Manage your snapshots and warm-pool policies."
              actions={
                <>
                  <div className="flex gap-4 text-copy-13 text-gray-700">
                    <span>Available: {stats.available}</span>
                    <span>Claimed: {stats.claimed}</span>
                    <span>Expired: {stats.expired}</span>
                  </div>
                  <Button asChild variant="secondary">
                    <Link href="/desktop">Desktop</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/sandboxes">Sandboxes</Link>
                  </Button>
                </>
              }
            />

            <Card>
              <CardHeader>
                <CardTitle>Base Images</CardTitle>
                <CardDescription>
                  User snapshots are built on top of these minimal defaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-copy-13 text-gray-800 md:grid-cols-2">
                <div className="rounded-md border border-gray-alpha-300 p-3">
                  <p className="font-medium text-gray-1000">
                    Golden GUI (minimal)
                  </p>
                  <p>
                    Browser + file manager + terminal stack + runtime
                    essentials.
                  </p>
                  <p className="mt-1 text-gray-700">
                    Includes: Firefox, Nautilus, Text Editor, Calculator,
                    Node/npm/pnpm/Bun, Python/pip, Git, tmux, jq.
                  </p>
                </div>
                <div className="rounded-md border border-gray-alpha-300 p-3">
                  <p className="font-medium text-gray-1000">
                    Golden CLI (minimal)
                  </p>
                  <p>CLI-only runtime with bridge and terminal essentials.</p>
                  <p className="mt-1 text-gray-700">
                    Includes: Node/npm/pnpm/Bun, Python/pip, Git, tmux, jq, vim.
                  </p>
                </div>
              </CardContent>
            </Card>

            {error ? (
              <div className="rounded-md border border-red-300 bg-red-100 px-4 py-3 text-copy-13 text-red-900">
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Create Snapshot From Running Workspace</CardTitle>
                  <CardDescription>
                    {snapshots.length}/{limits.maxSnapshotsPerUser} snapshots
                    used.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Snapshot name"
                    value={captureName}
                    onChange={(e) => setCaptureName(e.target.value)}
                  />
                  <Select
                    value={captureWorkspaceId}
                    onValueChange={setCaptureWorkspaceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select running workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {runningWorkspaces.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Description (optional)"
                    value={captureDescription}
                    onChange={(e) => setCaptureDescription(e.target.value)}
                  />
                  <Button
                    disabled={!captureName || !captureWorkspaceId || !!busy}
                    onClick={() =>
                      runWithState("capture", async () => {
                        captureEvent("snapshot_capture_requested", {
                          workspaceId: captureWorkspaceId,
                          name: captureName,
                        });
                        await captureSnapshotMutate({
                          workspaceId: captureWorkspaceId,
                          name: captureName,
                          description: captureDescription || undefined,
                        });
                        captureEvent("snapshot_capture_succeeded", {
                          workspaceId: captureWorkspaceId,
                          name: captureName,
                        });
                        setCaptureName("");
                        setCaptureDescription("");
                      })
                    }
                  >
                    {busy === "capture" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      "Capture Snapshot"
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Build Snapshot From Script</CardTitle>
                  <CardDescription>
                    Build custom GUI/CLI images with install scripts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Snapshot name"
                    value={buildName}
                    onChange={(e) => setBuildName(e.target.value)}
                  />
                  <Select
                    value={buildExperience}
                    onValueChange={(value) =>
                      setBuildExperience(value as "gui" | "cli")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Experience" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(EXPERIENCES).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {buildExperience === "gui" ? (
                    <div className="flex gap-2">
                      <Select
                        value={guiTemplate}
                        onValueChange={(value) => {
                          setGuiTemplate(value);
                          appendGuiTemplate(value);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Add GUI app template" />
                        </SelectTrigger>
                        <SelectContent>
                          {GUI_APP_TEMPLATES.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <Input
                    placeholder="Description (optional)"
                    value={buildDescription}
                    onChange={(e) => setBuildDescription(e.target.value)}
                  />
                  <Textarea
                    placeholder="Install script (bash)"
                    rows={6}
                    value={buildScript}
                    onChange={(e) => setBuildScript(e.target.value)}
                  />
                  <Button
                    disabled={!buildName || !buildScript || !!busy}
                    onClick={() =>
                      runWithState("build", async () => {
                        captureEvent("snapshot_build_requested", {
                          name: buildName,
                          experience: buildExperience,
                        });
                        await buildSnapshotMutate({
                          name: buildName,
                          installScript: buildScript,
                          description: buildDescription || undefined,
                          experience: buildExperience,
                        });
                        captureEvent("snapshot_build_succeeded", {
                          name: buildName,
                          experience: buildExperience,
                        });
                        setBuildName("");
                        setBuildDescription("");
                        setBuildScript("");
                      })
                    }
                  >
                    {busy === "build" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      "Build Snapshot"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>My Snapshots</CardTitle>
                <CardDescription>
                  Use as launch source and warm-pool backing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-alpha-300 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-copy-14 font-medium text-gray-1000">
                        {snapshot.name}
                      </p>
                      <p className="text-copy-12 text-gray-700">
                        {snapshot.provider} · {snapshot.experience} ·{" "}
                        {snapshot.displayClient ?? "none"} ·{" "}
                        {snapshot.sizeProfile}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{snapshot.status}</Badge>
                      {snapshot.isDefault ? (
                        <Badge
                          variant="outline"
                          className="border-green-300 bg-green-100 text-green-900"
                        >
                          default
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          runWithState(`default-${snapshot.id}`, async () => {
                            await updateSnapshotMutate(snapshot.id, {
                              isDefault: true,
                            });
                          })
                        }
                      >
                        Set default
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!!busy}
                        onClick={() =>
                          runWithState(`del-${snapshot.id}`, async () => {
                            await deleteSnapshotMutate(snapshot.id);
                          })
                        }
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                ))}
                {snapshots.length === 0 ? (
                  <p className="text-copy-13 text-gray-700">
                    No snapshots yet.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Warm Pool Policies
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-alpha-200 hover:text-gray-1000"
                        aria-label="What warm pool policies do"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={8}
                      className="max-w-sm text-copy-12 leading-relaxed select-none"
                    >
                      Warm pool keeps pre-booted background sandboxes for the
                      exact profile bucket you choose. When you launch with a
                      matching profile, startup is usually faster (hit). If no
                      warm entry is ready, launch still works with a normal cold
                      boot (miss).
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <CardDescription>
                  Buckets used: {policies.length}/
                  {policyLimits.maxPoolBucketsPerUser} · Total target capped at{" "}
                  {policyLimits.maxWarmEntriesPerUserTotal}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-3">
                  <Select value={policyProvider} disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vercel">
                        {PROVIDERS.vercel?.label ?? "Vercel Sandbox"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={policyExperience}
                    onValueChange={setPolicyExperience}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Experience" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(EXPERIENCES).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={policyDisplayClient} disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Display client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xpra">
                        {DISPLAY_CLIENTS.xpra?.label ?? "Xpra"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={policySizeProfile}
                    onValueChange={setPolicySizeProfile}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Size profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SIZE_PROFILES).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={policySourceType}
                    onValueChange={(value) =>
                      setPolicySourceType(
                        value as "platform_default" | "user_snapshot",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Snapshot source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform_default">
                        Platform default
                      </SelectItem>
                      <SelectItem value="user_snapshot">
                        User snapshot
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Target (0-5)"
                    value={policyTarget}
                    onChange={(e) => setPolicyTarget(e.target.value)}
                  />
                  {policySourceType === "user_snapshot" ? (
                    <Select
                      value={policySnapshotRefId}
                      onValueChange={setPolicySnapshotRefId}
                    >
                      <SelectTrigger className="md:col-span-2">
                        <SelectValue placeholder="Pick snapshot" />
                      </SelectTrigger>
                      <SelectContent>
                        {readySnapshots.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    runWithState("policy-create", async () => {
                      captureEvent("pool_policy_create_requested", {
                        provider: policyProvider,
                        experience: policyExperience,
                        displayClient:
                          policyExperience === "cli"
                            ? "none"
                            : policyDisplayClient,
                        sizeProfile: policySizeProfile,
                        snapshotRefType: policySourceType,
                      });
                      await createPoolPolicyMutate({
                        provider: policyProvider,
                        experience: policyExperience,
                        displayClient:
                          policyExperience === "cli"
                            ? "none"
                            : policyDisplayClient,
                        sizeProfile: policySizeProfile,
                        snapshotRefType: policySourceType,
                        snapshotRefId:
                          policySourceType === "user_snapshot"
                            ? policySnapshotRefId
                            : null,
                        target: Number(policyTarget || "0"),
                        enabled: true,
                      });
                      captureEvent("pool_policy_create_succeeded", {
                        provider: policyProvider,
                        experience: policyExperience,
                        displayClient:
                          policyExperience === "cli"
                            ? "none"
                            : policyDisplayClient,
                        sizeProfile: policySizeProfile,
                      });
                    })
                  }
                >
                  {busy === "policy-create" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    "Create policy"
                  )}
                </Button>

                <div className="space-y-2">
                  {policies.map((policy) => (
                    <div
                      key={policy.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-alpha-300 p-3"
                    >
                      <div>
                        <p className="text-copy-14 font-medium text-gray-1000">
                          {policy.provider} · {policy.experience} ·{" "}
                          {policy.displayClient} · {policy.sizeProfile}
                        </p>
                        <p className="text-copy-12 text-gray-700">
                          source={policy.snapshotRefType}
                          {policy.snapshotRefId
                            ? ` (${policy.snapshotRefId.slice(0, 8)}...)`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {policy.enabled ? "enabled" : "disabled"}
                        </Badge>
                        <Input
                          className="w-20"
                          value={String(policy.target)}
                          onChange={(e) => {
                            const value = Number(e.target.value || "0");
                            void runWithState(
                              `policy-target-${policy.id}`,
                              async () => {
                                captureEvent("pool_policy_update_requested", {
                                  policyId: policy.id,
                                  target: value,
                                });
                                await updatePoolPolicyMutate(policy.id, {
                                  target: value,
                                });
                                captureEvent("pool_policy_update_succeeded", {
                                  policyId: policy.id,
                                  target: value,
                                });
                              },
                            );
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() =>
                            runWithState(
                              `policy-toggle-${policy.id}`,
                              async () => {
                                captureEvent("pool_policy_update_requested", {
                                  policyId: policy.id,
                                  enabled: !policy.enabled,
                                });
                                await updatePoolPolicyMutate(policy.id, {
                                  enabled: !policy.enabled,
                                });
                                captureEvent("pool_policy_update_succeeded", {
                                  policyId: policy.id,
                                  enabled: !policy.enabled,
                                });
                              },
                            )
                          }
                        >
                          {policy.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!!busy}
                          onClick={() =>
                            runWithState(
                              `policy-del-${policy.id}`,
                              async () => {
                                captureEvent("pool_policy_delete_requested", {
                                  policyId: policy.id,
                                });
                                await deletePoolPolicyMutate(policy.id);
                                captureEvent("pool_policy_delete_succeeded", {
                                  policyId: policy.id,
                                });
                              },
                            )
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                  {policies.length === 0 ? (
                    <p className="text-copy-13 text-gray-700">
                      No warm-pool policies yet.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <AppPageFooter />
      </div>
    </main>
  );
}
