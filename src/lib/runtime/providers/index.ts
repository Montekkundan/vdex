import { PROVIDERS } from "@/lib/runtime/profiles";
import { azureProviderDriver } from "@/lib/runtime/providers/azure";
import { gcpProviderDriver } from "@/lib/runtime/providers/gcp";
import { vercelProviderDriver } from "@/lib/runtime/providers/vercel";
import {
  ProviderRuntimeError,
  type ProviderDriver,
} from "@/lib/runtime/providers/types";
import type { ProviderId } from "@/types/workspace";

const DRIVERS: Record<ProviderId, ProviderDriver> = {
  vercel: vercelProviderDriver,
  azure: azureProviderDriver,
  gcp: gcpProviderDriver,
};

export function getProviderDriver(provider: ProviderId): ProviderDriver {
  const config = PROVIDERS[provider];

  if (!config) {
    throw new ProviderRuntimeError(
      "UNSUPPORTED_PROVIDER",
      `Provider '${provider}' is not supported.`,
    );
  }

  if (!config.enabled) {
    throw new ProviderRuntimeError(
      "PROVIDER_NOT_IMPLEMENTED",
      `Provider '${provider}' is not available yet.`,
    );
  }

  const driver = DRIVERS[provider];
  if (!driver) {
    throw new ProviderRuntimeError(
      "PROVIDER_NOT_IMPLEMENTED",
      `Provider '${provider}' is not implemented yet.`,
    );
  }

  return driver;
}
