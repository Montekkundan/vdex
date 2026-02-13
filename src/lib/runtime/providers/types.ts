import type { CreateSandboxResult } from "@/lib/sandbox/client";
import type { SandboxInfo } from "@/types/sandbox";
import type { DisplayClient, ProviderId } from "@/types/workspace";

export type RuntimeResources = {
  vcpus: number;
  memoryGb: number;
};

export type CreateWorkspaceRuntimeParams = {
  snapshotId?: string;
  resources: RuntimeResources;
  displayClient: DisplayClient;
};

export type ProviderErrorCode =
  | "UNSUPPORTED_PROVIDER"
  | "PROVIDER_NOT_IMPLEMENTED";

export class ProviderRuntimeError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRuntimeError";
  }
}

export interface ProviderDriver {
  id: ProviderId;
  createWorkspaceRuntime(
    params: CreateWorkspaceRuntimeParams,
  ): Promise<CreateSandboxResult>;
  getRuntime(sandboxId: string): Promise<SandboxInfo>;
  stopRuntime(sandboxId: string): Promise<void>;
  snapshotRuntime(sandboxId: string): Promise<string>;
  extendRuntime(sandboxId: string, durationMs: number): Promise<void>;
  listRuntimes(): Promise<unknown>;
}
