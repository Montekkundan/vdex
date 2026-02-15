# Desktop Architecture (XPRA-first)

## 1) Purpose and Scope
This document describes the browser desktop stack for `/desktop` workspaces in VDEX, with focus on XPRA GUI sessions and shared desktop chrome (taskbar, launcher, windows, notifications).

Primary route surfaces:
- `/desktop` -> workspace hub (`src/app/desktop/desktop-hub.tsx`)
- `/desktop/[slug]` -> workspace shell (`src/app/desktop/desktop-shell.tsx`)

## 2) Route-Level Render Paths

### Hub vs Workspace
- Hub page lists and manages workspaces.
- Workspace page mounts `DesktopShell` for active workspace UX.

### GUI (XPRA) path
- `DesktopShell` starts `XpraConnector` when:
  - `experience === "gui"`
  - `displayClient === "xpra"`
- XPRA windows are mirrored into window-store entries with `appId` like `xpra:<wid>`.

### GUI (non-XPRA) path
- `RemoteDisplayClient` renders full-screen iframe for `rdp/vnc/novnc/kasmvnc/webrtc`.
- Desktop window-manager chrome is not used as remote window compositor in these modes.

### CLI path
- `DesktopShell` renders terminal-only workspace view (no desktop window manager chrome).

## 3) Component Map by Area

### Desktop surface
- `src/components/desktop/Desktop.tsx`
- `src/components/desktop/DesktopIcon.tsx`
- `src/components/desktop/DesktopBackground.tsx`

### Window manager
- `src/components/window/Window.tsx`
- `src/components/window/WindowFrame.tsx`
- `src/components/window/WindowContent.tsx`
- `src/components/desktop/WindowRenderer.tsx`
- `src/components/desktop/WindowSwitcher.tsx`

### Taskbar / launcher / switcher
- `src/components/taskbar/Taskbar.tsx`
- `src/components/taskbar/AppLauncher.tsx`
- `src/components/taskbar/RunningApps.tsx`
- `src/components/taskbar/WorkspaceSwitcher.tsx`
- `src/components/taskbar/SystemTray.tsx`

### Notifications
- `src/stores/notification-store.ts`
- `src/components/notifications/NotificationToasts.tsx`
- `src/components/notifications/NotificationCenter.tsx`

### XPRA integration
- `src/components/apps/xpra-window/XpraConnector.tsx`
- `src/components/apps/xpra-window/XpraWindow.tsx`
- `src/stores/xpra-store.ts`
- Worker entrypoints:
  - `src/workers/xpra-packet.worker.ts`
  - `src/workers/xpra-decode.worker.ts`

## 4) Store / Data Flow Map

- `workspace-store`:
  - active workspace identity/status/sandbox domains
  - route/workspace selection state
- `desktop-store`:
  - built-in + remote desktop entries
  - desktop icon list and wallpaper
- `window-store`:
  - managed window geometry, focus, z-index, snapped/maximized/minimized state
- `xpra-store`:
  - XPRA client/session state, X11 windows, pointer/cursor, per-window icons
- `notification-store`:
  - toast queue + history + notification center + system tray metadata

## 5) App Launch Lifecycle
1. User action from desktop icon/launcher.
2. `useLaunchApp()` resolves canonical app id:
   - `component` (built-in React app) OR
   - `exec` (X11 command) OR
   - `id`
3. Built-in app id -> `window-store.openWindow()` with React app component.
4. X11 app command -> `xpra-store.launchApp(command)` -> XPRA start command.
5. XPRA emits `newWindow` events; `XpraConnector` mirrors them to managed windows.

## 6) Icon Resolution Flow
`src/lib/icons/resolve-window-icon.ts`

Priority:
1. XPRA window icon (`windowIcons` data URI)
2. Desktop entry icon (`desktop-store.apps`)
3. Fallback rendering in icon consumers

Desktop app normalization uses Dusk icon overrides for common app names (`src/stores/desktop-store.ts`).

## 7) Error + Notification Flow

Standardized reporter:
- `src/lib/desktop/report-error.ts`

Event shape:
- `DesktopAppErrorEvent { source, severity, message, details?, dedupeKey?, workspaceId? }`

Behavior:
1. Dedupe bursty repeats.
2. Log with scoped desktop logger (`src/lib/desktop/logger.ts`).
3. Emit desktop notification (toast + Notification Center history) via `notification-store`.

Source examples:
- `terminal`, `files`, `code`, `xpra`, `system`

## 8) Code-Server Integration Notes

Code app:
- `src/components/apps/code-server/CodeServerApp.tsx` (iframe)

Snapshot bootstrap:
- `src/lib/sandbox/build-golden-snapshot.ts`
- `src/lib/sandbox/vscode/index.ts`

Defaults include local Geist theme and curated extension set. Settings are generated to minimize extension update/gallery noise in sandboxed sessions.

## 9) Troubleshooting Checklist

### XPRA not connecting
- Check `src/stores/xpra-store.ts` connect path.
- Verify worker initialization fallback and websocket domain.

### XPRA app launch timeout
- Triggered by `LAUNCH_TIMEOUT_MS` in `src/stores/xpra-store.ts`.
- Notification is emitted via `reportDesktopError`.

### Missing desktop icons / stale app list
- Check `/bridge/apps-generation` polling in `src/lib/hooks/use-sandbox-bridge.ts`.
- Verify `desktop-store.fetchRemoteApps`.

### Notification issues
- Verify `notification-store` preferences (`desktopNotifMode`, DND, browser permission).
- Ensure `NotificationToasts` and `NotificationCenter` are mounted in `DesktopShell`.

### Code app extension/runtime noise
- Check curated extension list in `build-golden-snapshot.ts`.
- Check generated code-server settings in `vscode/index.ts`.
