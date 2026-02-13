# VDEX

VDEX is a web desktop for Vercel Sandbox.

Each user signs in, creates their own workspace VM, and gets a GUI desktop in the browser that can run:

- built-in web apps (Files, Terminal, Settings, App Store, Code)
- Linux GUI apps streamed via Xpra (for example Firefox)

Core idea: this is a per-user interface on top of that user's Vercel Sandbox resources.

## What This App Does

- User authentication and workspace ownership
- Workspace list at `/desktop`
- Per-workspace desktop at `/desktop/[slug]`
- Start, open, shutdown, snapshot, restart, and delete workspace actions
- Snapshot-based recovery for stopped/expired sandboxes
- Xpra bridge for X11 application streaming

## Current Architecture (High-level)

- Next.js app/router for UI + API
- Postgres (Neon via Drizzle) for users/workspaces/config
- `@vercel/sandbox` for sandbox create/get/stop/snapshot/extend
- Xpra + sandbox services running inside each sandbox

### Port Structure

Each sandbox exposes 4 fixed ports:

- `14080`: selected display transport (Xpra/RDP/VNC/noVNC/KasmVNC/WebRTC via unified display domain)
- `14081`: services/control API (files, processes, terminal relay, bridge APIs)
- `14082`: code-server
- `14083`: preview (user app/dev server previews)

Display abstraction:

- The app now treats `14080` as a generic `display` endpoint.
- Workspace `displayClient` selects the display mode.
- In the current compatibility implementation, all display modes route through the same display gateway endpoint on `14080`.

## Important Operational Notes

- A workspace row can exist even if the underlying sandbox died; APIs reconcile and mark it stopped.
- "Start" is only available when a workspace has a snapshot ID.
- Warm pool behavior is environment-configurable:
  - `WARM_POOL_TARGET`
  - `WARM_POOL_AUTO_REPLENISH`
- On local development (`localhost`), service calls are routed through same-origin API proxy paths to avoid CORS issues.

## Provisioning Logic

Display-client-aware sandbox provisioning:

- `xpra`
  - May claim a warm-pool sandbox ID.
  - Warm-pool claim is only used for the default profile (`balanced_4c8g`) with no explicit snapshot override.
  - Otherwise provisions a fresh sandbox.
- `novnc`, `vnc`, `kasmvnc`, `rdp`, `webrtc`
  - Always provision a fresh sandbox (no warm-pool claim path).

Snapshot selection:

- New VM create
  - Uses explicit `snapshotId` if provided.
  - Otherwise uses the current golden snapshot.
- Restart/reconnect
  - Uses the workspace snapshot first (`workspace.snapshotId`).
  - Falls back to the current golden snapshot when needed.

## Setup

## 1. Install

```bash
bun install
```

## 2. Configure env

Copy `.env.example` to `.env` and set values:

- `DATABASE_URL`
- `SESSION_SECRET`
- `CRON_SECRET`
- `VERCEL_CLIENT_ID`
- `VERCEL_CLIENT_SECRET`
- optional: `BETTER_AUTH_URL`
- optional warm pool values (`WARM_POOL_TARGET`, `WARM_POOL_AUTO_REPLENISH`)

## 3. Database

```bash
bun run db:push
```

## 4. Build a golden snapshot (recommended)

```bash
bun run snapshot
```

This prepares the baseline VM image so new workspaces have the full GUI stack (Xpra, desktop tools, etc).

## 5. Run locally

```bash
bun run dev
```

Open `http://localhost:3000`.

## Scripts

- `bun run dev` - start dev server
- `bun run build` - production build
- `bun run snapshot` - rebuild golden snapshot
- `bun run test:sandbox` - integration check for sandbox services
- `bun run db:push` - sync schema

## Deployment Notes (Hobby)

- Hobby cron can run once/day only.
- If you deploy on Hobby, avoid frequent cron schedules.
- `maxDuration` for Serverless Functions must be `<= 300`.

## Scope

This project is a practical browser GUI for user-owned Vercel sandboxes, not a full Linux distro or a full desktop environment replacement.
