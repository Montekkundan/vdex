"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  captureException,
  identifyUser,
  initObservabilityClient,
  setObservabilityContext,
  updateReplayForPath,
} from "@/lib/observability/client";
import { ObservabilityErrorBoundary } from "@/components/observability/error-boundary";
import { reportClientIncident } from "@/lib/admin/client-incident-reporter";

function ObservabilityRouteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    updateReplayForPath(pathname);
  }, [pathname]);

  return null;
}

export function ObservabilityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initObservabilityClient();

    setObservabilityContext({
      app: "vdex",
      env: process.env.NODE_ENV,
    });

    void fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (!user?.id) return;
        identifyUser({
          id: user.id,
          email: user.email ?? null,
          role: user.role ?? null,
          name: user.name ?? null,
        });
      })
      .catch(() => undefined);

    const onError = (event: ErrorEvent) => {
      captureException(event.error ?? event.message, {
        source: "window.onerror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
      void reportClientIncident({
        title: "Unhandled browser error",
        fingerprintSeed: `window.onerror:${event.filename ?? "unknown"}:${event.lineno ?? 0}:${event.colno ?? 0}:${event.message ?? "unknown"}`,
        severity: "sev2",
        source: "window.onerror",
        details: event.message ?? String(event.error ?? "Unknown error"),
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        source: "window.unhandledrejection",
      });
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === "string"
            ? event.reason
            : JSON.stringify(event.reason);
      void reportClientIncident({
        title: "Unhandled promise rejection",
        fingerprintSeed: `window.unhandledrejection:${reason ?? "unknown"}`,
        severity: "sev2",
        source: "window.unhandledrejection",
        details: reason ?? "Unknown rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <ObservabilityErrorBoundary>
      {children}
      <Suspense fallback={null}>
        <ObservabilityRouteTracker />
      </Suspense>
    </ObservabilityErrorBoundary>
  );
}
