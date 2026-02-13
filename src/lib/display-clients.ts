import type { DisplayClient } from "@/types/workspace";

export function getDisplayHealthPath(client: DisplayClient): string {
  switch (client) {
    case "novnc":
    case "vnc":
    case "rdp":
      return "/vnc.html";
    case "kasmvnc":
    case "rdp":
    case "webrtc":
    case "xpra":
    default:
      return "/";
  }
}

export function getDisplayIframeUrl(
  client: Exclude<DisplayClient, "xpra">,
  displayDomain: string,
): string {
  const base = `https://${displayDomain}`;
  switch (client) {
    case "novnc":
    case "vnc": {
      const params = new URLSearchParams({
        autoconnect: "1",
        resize: "remote",
        path: "websockify",
      });
      return `${base}/vnc.html?${params.toString()}`;
    }
    case "kasmvnc":
      return `${base}/`;
    case "rdp": {
      const params = new URLSearchParams({
        autoconnect: "1",
        resize: "remote",
        path: "websockify",
      });
      return `${base}/vnc.html?${params.toString()}`;
    }
    case "webrtc":
      return `${base}/`;
  }
}
