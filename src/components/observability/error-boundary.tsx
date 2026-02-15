"use client";

import React from "react";
import { captureException } from "@/lib/observability/client";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class ObservabilityErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, {
      source: "react_error_boundary",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
          <p className="text-copy-14 text-muted-foreground">
            Something went wrong. Please refresh the page.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
