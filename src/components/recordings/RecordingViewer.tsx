"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { RecordingDetail } from "@/types/recording";
import type { FitAddon, Terminal } from "ghostty-web";
import {
  DEFAULT_TERMINAL_SETTINGS,
  getFontFamilyForPreset,
  loadSandboxTerminalSettings,
  normalizeTerminalSettings,
} from "@/lib/terminal/config";

interface RecordingViewerProps {
  recording: RecordingDetail;
  mp4Url: string;
  canExport: boolean;
  onRequestExport?: () => Promise<void>;
  isExporting?: boolean;
}

const CLI_KEYFRAME_INTERVAL_MS = 5_000;

type ReplayKeyframe = {
  tMs: number;
  eventIndex: number;
  cols: number;
  rows: number;
};

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function RecordingViewer({
  recording,
  mp4Url,
  canExport,
  onRequestExport,
  isExporting = false,
}: RecordingViewerProps) {
  const [playing, setPlaying] = useState(false);
  const [tMs, setTMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const lastAppliedEventRef = useRef(0);
  const previousTMsRef = useRef(0);
  const keyframesRef = useRef<Map<number, ReplayKeyframe>>(new Map());
  const replayCursorHiddenRef = useRef(false);
  const lastLayoutTickRef = useRef(0);
  const modeRef = useRef(recording.mode);
  const durationRef = useRef(0);
  const tMsRef = useRef(tMs);
  const [layoutTick, setLayoutTick] = useState(0);
  const [terminalReady, setTerminalReady] = useState(false);
  const terminalSettings = useMemo(
    () =>
      normalizeTerminalSettings(
        recording.sandboxId
          ? loadSandboxTerminalSettings(recording.sandboxId)
          : DEFAULT_TERMINAL_SETTINGS,
      ),
    [recording.sandboxId],
  );

  const durationMs = useMemo(() => {
    if (typeof recording.durationMs === "number" && recording.durationMs > 0) {
      return recording.durationMs;
    }
    if (recording.videoChunks.length > 0) {
      return Math.max(...recording.videoChunks.map((chunk) => chunk.tEndMs));
    }
    if (recording.terminalEvents.length > 0) {
      return Math.max(...recording.terminalEvents.map((event) => event.tMs));
    }
    return 1_000;
  }, [recording]);
  durationRef.current = durationMs;
  tMsRef.current = tMs;
  modeRef.current = recording.mode;

  useEffect(() => {
    if (recording.mode !== "cli") return;

    if (!playing) return;
    const step = window.setInterval(() => {
      setTMs((current) => {
        const next = current + 100 * speed;
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(step);
  }, [durationMs, playing, recording.mode, speed]);

  useEffect(() => {
    if (recording.mode !== "gui") return;
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
  }, [recording.mode, speed]);

  const cliReplayEvents = useMemo(
    () =>
      recording.mode === "cli"
        ? recording.terminalEvents
            .filter((event) => event.eventType === "stdout" || event.eventType === "resize")
            .sort((a, b) => (a.tMs === b.tMs ? a.id - b.id : a.tMs - b.tMs))
        : [],
    [recording.mode, recording.terminalEvents],
  );

  const togglePlayback = useMemo(
    () => () => {
      if (recording.mode === "gui") {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
        return;
      }
      setPlaying((prev) => !prev);
    },
    [recording.mode],
  );

  const seekTo = useMemo(
    () => (nextMs: number) => {
      const clamped = Math.max(0, Math.min(durationMs, nextMs));
      setTMs(clamped);
      if (recording.mode === "gui" && videoRef.current) {
        videoRef.current.currentTime = clamped / 1000;
      }
    },
    [durationMs, recording.mode],
  );

  const seekBy = useMemo(
    () => (deltaMs: number) => seekTo(tMs + deltaMs),
    [seekTo, tMs],
  );

  useEffect(() => {
    modeRef.current = recording.mode;
  }, [recording.mode]);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  useEffect(() => {
    tMsRef.current = tMs;
  }, [tMs]);

  useEffect(() => {
    if (recording.mode !== "cli") return;
    const container = terminalContainerRef.current;
    if (!container) return;
    const keyframes = keyframesRef.current;

    let disposed = false;
    setTerminalReady(false);

    const neutralizeInteractiveLayers = () => {
      const interactive = container.querySelectorAll<HTMLElement>(
        'textarea, [contenteditable=\"true\"], [aria-label=\"Terminal input\"]',
      );
      interactive.forEach((el) => {
        if (el instanceof HTMLTextAreaElement) {
          el.readOnly = true;
          el.tabIndex = -1;
          el.style.caretColor = "transparent";
          el.style.pointerEvents = "none";
        } else {
          if (el.getAttribute("contenteditable") === "true") {
            el.setAttribute("contenteditable", "false");
          }
          el.tabIndex = -1;
          el.style.caretColor = "transparent";
          el.style.pointerEvents = "none";
        }
      });
    };

    const onContainerFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLTextAreaElement || target.isContentEditable) {
        target.blur();
        pageRef.current?.focus({ preventScroll: true });
      }
    };

    container.addEventListener("focusin", onContainerFocusIn, true);

    void (async () => {
      const ghostty = await import("ghostty-web");
      if (disposed) return;

      await ghostty.init();
      if (disposed) return;

      const term = new ghostty.Terminal({
        fontSize: terminalSettings.fontSize,
        // Replay should not show an editable local cursor.
        cursorBlink: false,
        cursorStyle: terminalSettings.cursorStyle,
        fontFamily: getFontFamilyForPreset(terminalSettings.fontPreset),
        disableStdin: true,
        theme: {
          background: terminalSettings.theme.background,
          foreground: terminalSettings.theme.foreground,
          cursor: terminalSettings.theme.cursor,
        },
      });
      const fitAddon = new ghostty.FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      neutralizeInteractiveLayers();
      // Always start replay from a known-empty screen state.
      term.write("\x1bc\x1b[?1049l\x1b[2J\x1b[H");
      fitAddon.fit();
      fitAddon.observeResize();

      const resizeObserver = new ResizeObserver(() => {
        if (resizeRafRef.current !== null) {
          cancelAnimationFrame(resizeRafRef.current);
        }
        resizeRafRef.current = requestAnimationFrame(() => {
          resizeRafRef.current = null;
          fitAddon.fit();
          neutralizeInteractiveLayers();
          setLayoutTick((value) => value + 1);
        });
      });
      resizeObserver.observe(container);

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;
      resizeObserverRef.current = resizeObserver;
      lastAppliedEventRef.current = 0;
      previousTMsRef.current = 0;
      keyframes.clear();
      keyframes.set(0, {
        tMs: 0,
        eventIndex: 0,
        cols: term.cols,
        rows: term.rows,
      });
      setTMs(0);
      replayCursorHiddenRef.current = true;
      term.write("\x1b[?25l");
      setTerminalReady(true);
    })();

    return () => {
      disposed = true;
      container.removeEventListener("focusin", onContainerFocusIn, true);
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      setTerminalReady(false);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      fitAddonRef.current?.dispose();
      fitAddonRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
      lastAppliedEventRef.current = 0;
      keyframes.clear();
      replayCursorHiddenRef.current = false;
    };
  }, [recording.id, recording.mode, terminalSettings]);

  useEffect(() => {
    if (recording.mode !== "cli") return;
    const term = terminalRef.current;
    if (!term || !terminalReady) return;
    const keyframes = keyframesRef.current;

    const layoutChanged = layoutTick !== lastLayoutTickRef.current;
    if (layoutChanged) {
      lastLayoutTickRef.current = layoutTick;
      // A viewport resize changes wrapping/layout. Rebuild from a clean state
      // so recorded output stays coherent instead of drifting/duplicating.
      keyframes.clear();
      keyframes.set(0, {
        tMs: 0,
        eventIndex: 0,
        cols: term.cols,
        rows: term.rows,
      });
      lastAppliedEventRef.current = 0;
      previousTMsRef.current = tMs + 1;
    }

    const targetIndex = cliReplayEvents.findIndex((event) => event.tMs > tMs);
    const applyUntil = targetIndex === -1 ? cliReplayEvents.length : targetIndex;
    const rewinding = tMs < previousTMsRef.current || applyUntil < lastAppliedEventRef.current;
    const largeJump = Math.abs(tMs - previousTMsRef.current) > CLI_KEYFRAME_INTERVAL_MS * 3;

    const resetTerminal = () => {
      if (typeof (term as unknown as { reset?: () => void }).reset === "function") {
        (term as unknown as { reset: () => void }).reset();
      }
      term.write("\x1bc\x1b[?1049l\x1b[2J\x1b[H");
    };

    const restoreFromKeyframe = (keyframe: ReplayKeyframe) => {
      resetTerminal();
      const resizable = term as unknown as { resize?: (cols: number, rows: number) => void };
      if (keyframe.cols > 0 && keyframe.rows > 0) {
        resizable.resize?.(keyframe.cols, keyframe.rows);
      }
      lastAppliedEventRef.current = keyframe.eventIndex;
    };

    const mustResetAtStart = tMs === 0;
    if (mustResetAtStart || rewinding || largeJump) {
      const targetBucket = Math.floor(tMs / CLI_KEYFRAME_INTERVAL_MS) * CLI_KEYFRAME_INTERVAL_MS;
      let chosen = keyframes.get(0) ?? {
        tMs: 0,
        eventIndex: 0,
        cols: term.cols,
        rows: term.rows,
      };

      for (const keyframe of keyframes.values()) {
        if (keyframe.tMs <= targetBucket && keyframe.tMs >= chosen.tMs) {
          chosen = keyframe;
        }
      }
      restoreFromKeyframe(chosen);
    }

    let nextKeyframeAt = Math.floor(previousTMsRef.current / CLI_KEYFRAME_INTERVAL_MS) *
      CLI_KEYFRAME_INTERVAL_MS + CLI_KEYFRAME_INTERVAL_MS;
    if (nextKeyframeAt <= 0) nextKeyframeAt = CLI_KEYFRAME_INTERVAL_MS;

    for (let i = lastAppliedEventRef.current; i < applyUntil; i += 1) {
      const event = cliReplayEvents[i];
      if (event.eventType === "resize") {
        try {
          const parsed = JSON.parse(event.payload) as { cols?: number; rows?: number };
          if (parsed.cols && parsed.rows) {
            const resizable = term as unknown as { resize?: (cols: number, rows: number) => void };
            resizable.resize?.(parsed.cols, parsed.rows);
          }
        } catch {
          // ignore malformed resize payloads
        }
      } else {
        term.write(event.payload);
      }

      // Keep lightweight structural keyframes only (event index + size).
      // Do not cache rendered lines; they are lossy and can poison later seeks.
      while (event.tMs >= nextKeyframeAt) {
        if (!keyframes.has(nextKeyframeAt)) {
          keyframes.set(nextKeyframeAt, {
            tMs: nextKeyframeAt,
            eventIndex: i + 1,
            cols: term.cols,
            rows: term.rows,
          });
        }
        nextKeyframeAt += CLI_KEYFRAME_INTERVAL_MS;
      }
    }

    lastAppliedEventRef.current = applyUntil;
    previousTMsRef.current = tMs;
  }, [cliReplayEvents, layoutTick, recording.mode, terminalReady, tMs]);

  useEffect(() => {
    if (recording.mode !== "cli") return;
    const term = terminalRef.current;
    if (!term || !terminalReady) return;

    const shouldHideCursor = !playing && tMs === 0;
    if (shouldHideCursor && !replayCursorHiddenRef.current) {
      term.write("\x1b[?25l");
      replayCursorHiddenRef.current = true;
      return;
    }
    if (!shouldHideCursor && replayCursorHiddenRef.current) {
      term.write("\x1b[?25h");
      replayCursorHiddenRef.current = false;
    }
  }, [playing, recording.mode, terminalReady, tMs]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || target.isContentEditable;
    }

    function clampTime(next: number): number {
      return Math.max(0, Math.min(durationRef.current, next));
    }

    function seekByGlobal(deltaMs: number) {
      const next = clampTime(tMsRef.current + deltaMs);
      setTMs(next);
      if (modeRef.current === "gui" && videoRef.current) {
        videoRef.current.currentTime = next / 1000;
      }
    }

    function togglePlaybackGlobal() {
      if (modeRef.current === "gui") {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
        return;
      }
      setPlaying((prev) => !prev);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (modeRef.current === "cli" || modeRef.current === "gui") {
        if (event.code === "Space") {
          event.preventDefault();
          togglePlaybackGlobal();
          return;
        }
        if (event.code === "KeyK") {
          event.preventDefault();
          togglePlaybackGlobal();
          return;
        }
        if (event.code === "ArrowLeft") {
          event.preventDefault();
          seekByGlobal(-5_000);
          return;
        }
        if (event.code === "ArrowRight") {
          event.preventDefault();
          seekByGlobal(5_000);
          return;
        }
        if (event.code === "KeyJ") {
          event.preventDefault();
          seekByGlobal(-10_000);
          return;
        }
        if (event.code === "KeyL") {
          event.preventDefault();
          seekByGlobal(10_000);
          return;
        }
      }
    }

    // Capture phase is intentional so focused terminal/canvas widgets cannot
    // swallow media shortcuts before we handle them.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      ref={pageRef}
      className="relative h-screen overflow-hidden bg-black text-white"
      tabIndex={-1}
    >
      <div className="h-full overflow-auto pb-44">
        {recording.mode === "gui" ? (
          <video
            ref={videoRef}
            className="h-full w-full bg-black object-contain"
            controls={false}
            src={mp4Url}
            onTimeUpdate={(event) => {
              const current = event.currentTarget.currentTime;
              setTMs(Math.floor(current * 1000));
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : (
          <div
            ref={terminalContainerRef}
            className="h-full w-full overflow-hidden"
            style={{ backgroundColor: terminalSettings.theme.background }}
            onMouseDownCapture={(event) => {
              // Replay is read-only: prevent Ghostty's hidden input from
              // receiving focus/caret on click.
              event.preventDefault();
              pageRef.current?.focus({ preventScroll: true });
            }}
            onPointerDownCapture={(event) => {
              event.preventDefault();
              pageRef.current?.focus({ preventScroll: true });
            }}
            onTouchStartCapture={(event) => {
              event.preventDefault();
              pageRef.current?.focus({ preventScroll: true });
            }}
            tabIndex={-1}
            role="application"
            aria-label="CLI recording replay"
          />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/92 p-3 backdrop-blur-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              if (recording.mode === "gui") {
                togglePlayback();
                return;
              }
              togglePlayback();
            }}
          >
            {playing ? "Pause" : "Play"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              seekBy(-10_000);
            }}
          >
            -10s
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              seekBy(10_000);
            }}
          >
            +10s
          </Button>

          <label className="ml-auto text-xs text-white/80">
            <span className="mr-2">Speed</span>
            <Select
              value={String(speed)}
              onValueChange={(value) => setSpeed(Number(value))}
            >
              <SelectTrigger
                className="inline-flex h-7 min-w-[72px] border-white/20 bg-black text-white"
                size="sm"
              >
                <SelectValue placeholder="Speed" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="0.5">0.5x</SelectItem>
                <SelectItem value="1">1x</SelectItem>
                <SelectItem value="1.5">1.5x</SelectItem>
                <SelectItem value="2">2x</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <Slider
          min={0}
          max={durationMs}
          value={[tMs]}
          onValueChange={(value) => {
            const next = value[0] ?? 0;
            seekTo(next);
          }}
          className="w-full"
        />

        <div className="mt-2 flex items-center justify-between text-xs text-white/75">
          <span>{formatMs(tMs)}</span>
          <span>{formatMs(durationMs)}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={mp4Url}>Download MP4</a>
          </Button>
          {canExport ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (onRequestExport) {
                  void onRequestExport();
                }
              }}
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Regenerate MP4"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
