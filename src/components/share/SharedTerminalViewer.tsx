"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Terminal, FitAddon } from "ghostty-web";

export function SharedTerminalViewer({
  servicesDomain,
  session = "main",
  className,
}: {
  servicesDomain: string;
  session?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const safeSession = useMemo(() => {
    const sanitized = session.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    return sanitized || "main";
  }, [session]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !servicesDomain) return;

    let disposed = false;
    let term: Terminal | undefined;
    let fitAddon: FitAddon | undefined;
    let ws: WebSocket | undefined;
    let resizeObserver: ResizeObserver | null = null;

    void (async () => {
      const ghostty = await import("ghostty-web");
      if (disposed) return;

      await ghostty.init();
      if (disposed) return;

      const t = new ghostty.Terminal({
        fontSize: 14,
        cursorBlink: false,
        cursorStyle: "block",
      });
      term = t;

      const fa = new ghostty.FitAddon();
      fitAddon = fa;
      t.loadAddon(fa);
      t.open(container);
      fa.fit();
      fa.observeResize();

      resizeObserver = new ResizeObserver(() => {
        if (!disposed) fa.fit();
      });
      resizeObserver.observe(container);

      const params = new URLSearchParams({
        cols: String(t.cols),
        rows: String(t.rows),
        readonly: "1",
        session: safeSession,
      });
      const wsUrl = `wss://${servicesDomain}/ws/terminal?${params.toString()}`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        if (typeof event.data === "string") {
          t.write(event.data);
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          t.write(new Uint8Array(event.data));
          return;
        }
        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buf) => {
            if (!disposed) t.write(new Uint8Array(buf));
          });
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          t.write("\r\n\x1b[90m[Viewer disconnected]\x1b[0m\r\n");
        }
      };

      t.onResize((size: { cols: number; rows: number }) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: size.cols,
              rows: size.rows,
            }),
          );
        }
      });
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      ws?.close();
      fitAddon?.dispose();
      term?.dispose();
    };
  }, [servicesDomain, safeSession]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full overflow-hidden"}
      style={{ backgroundColor: "#000" }}
      role="application"
      aria-label="Shared terminal view"
    />
  );
}
