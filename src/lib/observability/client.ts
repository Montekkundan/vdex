"use client";

import {
  initPosthogClient,
  posthogClientProvider,
  updatePosthogReplayForPath,
} from "@/lib/observability/providers/posthog-client";
import type {
  ObservabilityClient,
  ObservabilityEventProperties,
  ObservabilityUser,
} from "@/lib/observability/types";

const noopClient: ObservabilityClient = {
  identify: () => undefined,
  capture: () => undefined,
  captureException: () => undefined,
  setContext: () => undefined,
  startSpan: () => () => undefined,
};

const providerName = process.env.NEXT_PUBLIC_OBSERVABILITY_PROVIDER ?? "posthog";

const provider: ObservabilityClient = providerName === "noop" ? noopClient : posthogClientProvider;

export function initObservabilityClient() {
  if (providerName === "posthog") {
    initPosthogClient();
  }
}

export function updateReplayForPath(pathname: string) {
  if (providerName === "posthog") {
    updatePosthogReplayForPath(pathname);
  }
}

export function identifyUser(user: ObservabilityUser) {
  provider.identify(user);
}

export function captureEvent(eventName: string, props?: ObservabilityEventProperties) {
  provider.capture(eventName, props);
}

export function captureException(error: unknown, context?: ObservabilityEventProperties) {
  provider.captureException(error, context);
}

export function setObservabilityContext(context: ObservabilityEventProperties) {
  provider.setContext(context);
}

export function getObservabilityClient() {
  return provider;
}
