import { posthogServerProvider } from "@/lib/observability/providers/posthog-server";
import type {
  ObservabilityEventProperties,
  ObservabilityServer,
} from "@/lib/observability/types";

const providerName = process.env.OBSERVABILITY_PROVIDER ?? "posthog";

const noopServer: ObservabilityServer = {
  capture: async () => undefined,
  captureException: async () => undefined,
  shutdown: async () => undefined,
};

const provider: ObservabilityServer = providerName === "noop" ? noopServer : posthogServerProvider;

export async function captureServerEvent(eventName: string, props?: ObservabilityEventProperties) {
  await provider.capture(eventName, props);
}

export async function captureServerException(error: unknown, context?: ObservabilityEventProperties) {
  await provider.captureException(error, context);
}

export function getObservabilityServer() {
  return provider;
}
