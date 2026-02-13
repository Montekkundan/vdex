"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Terminal, FitAddon } from "ghostty-web";
import { useActiveSandbox } from "@/stores/workspace-store";
import { NoWorkspacePlaceholder } from "@/components/apps/no-workspace-placeholder";
import {
  saveTerminalState,
  loadTerminalState,
} from "@/lib/terminal/state-cache";
import {
  DEFAULT_TERMINAL_SETTINGS,
  getFontFamilyForPreset,
  normalizeTerminalSettings,
  type TerminalSettings,
} from "@/lib/terminal/config";

const SERIALIZE_INTERVAL_MS = 5_000;

export function TerminalApp({
  className,
  settings,
}: {
  className?: string;
  settings?: TerminalSettings;
  meta?: Record<string, unknown>;
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeWorkspaceId, sandbox } = useActiveSandbox();
  const servicesDomain = sandbox?.domains.services;
  const resolvedSettings = useMemo(
    () => normalizeTerminalSettings(settings ?? DEFAULT_TERMINAL_SETTINGS),
    [settings],
  );
  const resolvedFontFamily = useMemo(
    () => getFontFamilyForPreset(resolvedSettings.fontPreset),
    [resolvedSettings.fontPreset],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !servicesDomain || !activeWorkspaceId) return;

    let disposed = false;
    let connectFrameId: number | null = null;
    let term: Terminal | undefined;
    let fitAddon: FitAddon | undefined;
    let ws: WebSocket;
    let serializeInterval: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let refitTimer: ReturnType<typeof setTimeout> | null = null;

    // Defer setup to a requestAnimationFrame so that in React Strict Mode's
    // double-mount/unmount cycle the first invocation is cancelled before it
    // opens a WebSocket.
    connectFrameId = requestAnimationFrame(() => {
      if (disposed) return;
      connectFrameId = null;

      (async () => {
        const ghostty = await import("ghostty-web");
        if (disposed) return;

        await ghostty.init();
        if (disposed) return;

        // Canvas font rendering is sensitive to font-load timing. Ensure the
        // selected font is ready before opening the terminal.
        try {
          const primaryFamily = resolvedFontFamily.split(",")[0]?.trim();
          if (primaryFamily && "fonts" in document) {
            await document.fonts.load(`16px ${primaryFamily}`);
            await document.fonts.ready;
          }
        } catch {
          // best-effort
        }

        const t = new ghostty.Terminal({
          fontSize: resolvedSettings.fontSize,
          cursorBlink: resolvedSettings.cursorBlink,
          cursorStyle: resolvedSettings.cursorStyle,
          fontFamily: resolvedFontFamily,
          theme: {
            background: resolvedSettings.theme.background,
            foreground: resolvedSettings.theme.foreground,
            cursor: resolvedSettings.theme.cursor,
          },
        });
        term = t;

        const fa = new ghostty.FitAddon();
        fitAddon = fa;
        t.loadAddon(fa);

        t.open(container);
        const stretchCanvas = () => {
          const canvases = container.querySelectorAll("canvas");
          canvases.forEach((c) => {
            const canvas = c as HTMLCanvasElement;
            canvas.style.setProperty("width", "100%", "important");
            canvas.style.setProperty("height", "100%", "important");
            canvas.style.display = "block";
            canvas.style.setProperty("position", "absolute");
            canvas.style.setProperty("inset", "0");
          });
        };
        // Fit immediately, then refit after layout settles (fonts/devtools panels
        // can change metrics shortly after initial mount).
        fa.fit();
        stretchCanvas();
        refitTimer = setTimeout(() => {
          if (!disposed) {
            fa.fit();
            stretchCanvas();
          }
        }, 100);
        fa.observeResize();
        resizeObserver = new ResizeObserver(() => {
          if (!disposed) {
            fa.fit();
            stretchCanvas();
          }
        });
        resizeObserver.observe(container);

        if (disposed) {
          fa.dispose();
          t.dispose();
          return;
        }

        // Restore cached terminal content before connecting so the user
        // immediately sees previous output instead of a blank screen.
        const cached = loadTerminalState(activeWorkspaceId);
        if (cached) {
          t.write(cached);
        }

        const wsUrl = `wss://${servicesDomain}/ws/terminal?cols=${t.cols}&rows=${t.rows}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (disposed) return;
          if (!cached) {
            t.write("\x1b[2J\x1b[H");
          }
        };

        ws.onmessage = (event: MessageEvent) => {
          if (disposed) return;
          if (typeof event.data === "string") {
            t.write(event.data);
          } else if (event.data instanceof ArrayBuffer) {
            t.write(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            event.data.arrayBuffer().then((buf: ArrayBuffer) => {
              if (!disposed) t.write(new Uint8Array(buf));
            });
          }
        };

        ws.onclose = () => {
          if (!disposed) {
            t.write("\r\n\x1b[90m[Connection closed]\x1b[0m\r\n");
          }
        };

        ws.onerror = () => {
          if (!disposed) {
            t.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
          }
        };

        t.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        t.onResize((size: { cols: number; rows: number }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: size.cols,
                rows: size.rows,
              }),
            );
          }
        });

        serializeInterval = setInterval(() => {
          if (disposed || !activeWorkspaceId) return;
          try {
            const buffer = t.buffer?.active;
            if (!buffer) return;

            const lines: string[] = [];
            const rowCount = buffer.length;
            for (let i = 0; i < rowCount; i++) {
              const line = buffer.getLine(i);
              if (line) {
                lines.push(line.translateToString(true));
              }
            }
            while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
              lines.pop();
            }
            if (lines.length > 0) {
              saveTerminalState(activeWorkspaceId, lines.join("\r\n") + "\r\n");
            }
          } catch {
            // best-effort
          }
        }, SERIALIZE_INTERVAL_MS);
      })();
    });

    return () => {
      disposed = true;

      if (connectFrameId !== null) {
        cancelAnimationFrame(connectFrameId);
      }

      // Save final state before tearing down
      if (term && activeWorkspaceId) {
        try {
          const buffer = term.buffer?.active;
          if (buffer) {
            const lines: string[] = [];
            const rowCount = buffer.length;
            for (let i = 0; i < rowCount; i++) {
              const line = buffer.getLine(i);
              if (line) lines.push(line.translateToString(true));
            }
            while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
              lines.pop();
            }
            if (lines.length > 0) {
              saveTerminalState(
                activeWorkspaceId,
                lines.join("\r\n") + "\r\n",
              );
            }
          }
        } catch {
          // best-effort
        }
      }

      if (serializeInterval) clearInterval(serializeInterval);
      if (refitTimer) clearTimeout(refitTimer);
      resizeObserver?.disconnect();
      ws?.close();
      fitAddon?.dispose();
      term?.dispose();
    };
  }, [servicesDomain, activeWorkspaceId, resolvedSettings, resolvedFontFamily]);

  if (!activeWorkspaceId || !sandbox) {
    return (
      <NoWorkspacePlaceholder message="No active workspace. Create one to use the terminal." />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full overflow-hidden"}
      style={{ backgroundColor: resolvedSettings.theme.background }}
      role="application"
      aria-label="Terminal"
    />
  );
}
