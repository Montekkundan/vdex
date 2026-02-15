"use client";

import { useEffect } from "react";
import { captureException } from "@/lib/observability/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error, {
      source: "next_global_error",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">Critical application error</h2>
            <button
              className="mt-4 rounded-md border px-3 py-2 text-sm"
              onClick={() => reset()}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
