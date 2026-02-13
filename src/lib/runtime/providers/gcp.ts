import {
  ProviderRuntimeError,
  type ProviderDriver,
} from "@/lib/runtime/providers/types";

function notImplemented(): never {
  throw new ProviderRuntimeError(
    "PROVIDER_NOT_IMPLEMENTED",
    "Provider 'gcp' is not implemented yet.",
  );
}

export const gcpProviderDriver: ProviderDriver = {
  id: "gcp",
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
