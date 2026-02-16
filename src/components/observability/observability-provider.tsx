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
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        source: "window.unhandledrejection",
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
