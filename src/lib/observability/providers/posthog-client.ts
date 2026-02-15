"use client";

import posthog from "posthog-js";
import type {
  ObservabilityClient,
  ObservabilityEventProperties,
  ObservabilityUser,
} from "@/lib/observability/types";

let initialized = false;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const REPLAY_ALLOWED_PREFIXES = ["/desktop", "/profiles"];

function isReplayAllowedPath(pathname: string): boolean {
  return REPLAY_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function shouldEnableReplay(pathname: string): boolean {
  return process.env.NODE_ENV === "production" && isReplayAllowedPath(pathname);
}

function updateReplayState(pathname: string) {
  if (!initialized || typeof window === "undefined") return;

  const enabled = shouldEnableReplay(pathname);
  posthog.set_config({
    disable_session_recording: !enabled,
  });

  const replayControl = posthog as unknown as {
    startSessionRecording?: () => void;
    stopSessionRecording?: () => void;
  };

  if (enabled) {
    replayControl.startSessionRecording?.();
  } else {
    replayControl.stopSessionRecording?.();
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: typeof error === "string" ? error : "Unknown error" };
}

export function initPosthogClient() {
  if (initialized || typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) return;

  const initialReplayEnabled = shouldEnableReplay(window.location.pathname);

  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    capture_exceptions: IS_PRODUCTION,
    disable_surveys: true,
    disable_session_recording: !initialReplayEnabled,
    session_recording: {
      sample_rate: 0.2,
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: true,
        text: true,
        textarea: true,
      },
    },
    mask_all_text: true,
    mask_all_element_attributes: true,
  } as Record<string, unknown>);

  initialized = true;
  updateReplayState(window.location.pathname);
}

export function updatePosthogReplayForPath(pathname: string) {
  updateReplayState(pathname);
}

export const posthogClientProvider: ObservabilityClient = {
  identify(user: ObservabilityUser) {
    if (!initialized || !user.id) return;
    posthog.identify(user.id, {
      email: user.email ?? undefined,
      role: user.role ?? undefined,
      name: user.name ?? undefined,
    });
  },

  capture(eventName: string, props?: ObservabilityEventProperties) {
    if (!initialized) return;
    posthog.capture(eventName, props);
  },

  captureException(error: unknown, context?: ObservabilityEventProperties) {
    if (!initialized || !IS_PRODUCTION) return;
    posthog.capture("client_exception", {
      ...normalizeError(error),
      ...context,
    });
  },

  setContext(context: ObservabilityEventProperties) {
    if (!initialized) return;
    posthog.register(context);
  },

  startSpan(name: string, context?: ObservabilityEventProperties) {
    const startedAt = Date.now();
    posthogClientProvider.capture(`${name}_started`, context);
    return () => {
      posthogClientProvider.capture(`${name}_finished`, {
        ...context,
        latencyMs: Date.now() - startedAt,
      });
    };
  },
};
