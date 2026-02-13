"use client";

import { useEffect, useRef } from "react";
import { useXpraStore } from "@/stores/xpra-store";
import { useWindowStore } from "@/stores/window-store";
import { useActiveSandbox, useWorkspaceStore } from "@/stores/workspace-store";
import { isLiveSandboxStatus } from "@/lib/sandbox/status";

export function XpraConnector() {
  const { activeWorkspaceId, sandbox } = useActiveSandbox();
  const activeWorkspaceDisplayClient = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.displayClient ?? "xpra",
  );
  const xpraConnect = useXpraStore((s) => s.connect);
  const xpraDisconnect = useXpraStore((s) => s.disconnect);
  const xpraConnected = useXpraStore((s) => s.connected);
  const xpraWindows = useXpraStore((s) => s.windows);
  const xpraCloseWindow = useXpraStore((s) => s.closeWindow);
  const sendGlobalPointerPosition = useXpraStore((s) => s.sendGlobalPointerPosition);

  const openWindow = useWindowStore((s) => s.openWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const setWindowTitle = useWindowStore((s) => s.setWindowTitle);

  const connectedSandboxRef = useRef<string | null>(null);
  const trackedWidsRef = useRef<Set<number>>(new Set());

  // Connect to Xpra when sandbox is active
  useEffect(() => {
    if (activeWorkspaceDisplayClient !== "xpra") return;
    if (!sandbox?.domains.display || !activeWorkspaceId) return;
    if (!isLiveSandboxStatus(sandbox.status)) return;

    const xpraDomain = sandbox.domains.display;
    if (connectedSandboxRef.current === xpraDomain) return;

    connectedSandboxRef.current = xpraDomain;
    xpraConnect(`https://${xpraDomain}`);

    const tracked = trackedWidsRef.current;
    return () => {
      connectedSandboxRef.current = null;
      tracked.clear();
      xpraDisconnect();
    };
  }, [
    activeWorkspaceDisplayClient,
    sandbox?.domains.display,
    sandbox?.status,
    activeWorkspaceId,
    xpraConnect,
    xpraDisconnect,
  ]);

  // Forward global mouse position to Xpra root window (for apps like xeyes)
  useEffect(() => {
    if (!xpraConnected) return;

    const handleMouseMove = (e: MouseEvent) => {
      sendGlobalPointerPosition(e.clientX, e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [xpraConnected, sendGlobalPointerPosition]);

  // Sync Xpra windows -> Sandcastle windows (new/removed X11 windows)
  useEffect(() => {
    if (!xpraConnected) return;

    const currentWids = new Set<number>();
    xpraWindows.forEach((win) => {
      if (win.overrideRedirect) return;
      currentWids.add(win.wid);

      if (!trackedWidsRef.current.has(win.wid)) {
        trackedWidsRef.current.add(win.wid);
        openWindow({
          title: win.title,
          appId: `xpra:${win.wid}`,
          width: Math.max(100, win.width),
          height: Math.max(100, win.height),
          x: win.x,
          y: win.y,
        });
      }
    });

    // Xpra closed a window -> close the Sandcastle window
    trackedWidsRef.current.forEach((wid) => {
      if (!currentWids.has(wid)) {
        trackedWidsRef.current.delete(wid);
        const state = useWindowStore.getState();
        const windows = state.getWindows();
        const match = windows.find((w) => w.appId === `xpra:${wid}`);
        if (match) closeWindow(match.id);
      }
    });
  }, [xpraConnected, xpraWindows, openWindow, closeWindow]);

  // Sync Xpra window changes -> Sandcastle windows (title + size)
  useEffect(() => {
    if (!xpraConnected) return;

    const unsubscribe = useXpraStore.subscribe((state, prevState) => {
      state.windows.forEach((win, wid) => {
        const prev = prevState.windows.get(wid);
        if (!prev) return;

        const wsState = useWindowStore.getState();
        const windows = wsState.getWindows();
        const match = windows.find((w) => w.appId === `xpra:${wid}`);
        if (!match) return;

        if (prev.title !== win.title) {
          setWindowTitle(match.id, win.title);
        }

        // Xpra app resized itself -> update sandcastle window to match
        if (prev.width !== win.width || prev.height !== win.height) {
          resizeWindow(match.id, {
            width: Math.max(100, win.width),
            height: Math.max(100, win.height),
          });
        }
      });
    });

    return unsubscribe;
  }, [xpraConnected, setWindowTitle, resizeWindow]);

  // Reverse sync: Sandcastle window closed -> kill the X11 app via Xpra
  useEffect(() => {
    if (!xpraConnected) return;

    // Subscribe to window store changes to detect closed xpra windows
    const unsubscribe = useWindowStore.subscribe((state, prevState) => {
      const wsId = state.activeWorkspaceId;
      if (!wsId) return;

      const current = state.windowsByWorkspace[wsId] || [];
      const prev = prevState.windowsByWorkspace[wsId] || [];

      // Find xpra windows that existed before but are gone now
      for (const prevWin of prev) {
        if (!prevWin.appId.startsWith("xpra:")) continue;
        const stillExists = current.some((w) => w.id === prevWin.id);
        if (!stillExists) {
          const wid = parseInt(prevWin.appId.split(":")[1], 10);
          if (!isNaN(wid) && trackedWidsRef.current.has(wid)) {
            trackedWidsRef.current.delete(wid);
            xpraCloseWindow(wid);
          }
        }
      }
    });

    return unsubscribe;
  }, [xpraConnected, xpraCloseWindow]);

  return null;
}
