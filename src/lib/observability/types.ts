export type ObservabilityUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  name?: string | null;
};

export type ObservabilityEventProperties = Record<string, unknown>;

export interface ObservabilityClient {
  identify: (user: ObservabilityUser) => void;
  capture: (eventName: string, props?: ObservabilityEventProperties) => void;
  captureException: (error: unknown, context?: ObservabilityEventProperties) => void;
  setContext: (context: ObservabilityEventProperties) => void;
  startSpan?: (name: string, context?: ObservabilityEventProperties) => () => void;
}

export interface ObservabilityServer {
  capture: (eventName: string, props?: ObservabilityEventProperties) => Promise<void>;
  captureException: (error: unknown, context?: ObservabilityEventProperties) => Promise<void>;
  shutdown?: () => Promise<void>;
}
