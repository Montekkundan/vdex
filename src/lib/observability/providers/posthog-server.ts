import type {
  ObservabilityEventProperties,
  ObservabilityServer,
} from "@/lib/observability/types";

const FALLBACK_DISTINCT_ID = "server";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function getEndpoint() {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  return `${host.replace(/\/$/, "")}/capture/`;
}

async function sendEvent(eventName: string, props?: ObservabilityEventProperties) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const distinctId =
    typeof props?.userId === "string"
      ? props.userId
      : typeof props?.distinctId === "string"
        ? props.distinctId
        : FALLBACK_DISTINCT_ID;

  await fetch(getEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event: eventName,
      distinct_id: distinctId,
      properties: {
        ...props,
      },
    }),
  }).catch(() => undefined);
}

export const posthogServerProvider: ObservabilityServer = {
  async capture(eventName, props) {
    await sendEvent(eventName, props);
  },

  async captureException(error, context) {
    if (!IS_PRODUCTION) return;
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    await sendEvent("server_exception", {
      ...context,
      message,
      stack,
    });
  },

  async shutdown() {
    return;
  },
};
