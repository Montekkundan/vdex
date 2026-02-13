import {
  ProviderRuntimeError,
  type ProviderDriver,
} from "@/lib/runtime/providers/types";

function notImplemented(): never {
  throw new ProviderRuntimeError(
    "PROVIDER_NOT_IMPLEMENTED",
    "Provider 'azure' is not implemented yet.",
  );
}

export const azureProviderDriver: ProviderDriver = {
  id: "azure",
  async createWorkspaceRuntime() {
    notImplemented();
  },
  async getRuntime() {
    notImplemented();
  },
  async stopRuntime() {
    notImplemented();
  },
  async snapshotRuntime() {
    notImplemented();
  },
  async extendRuntime() {
    notImplemented();
  },
  async listRuntimes() {
    notImplemented();
  },
};
