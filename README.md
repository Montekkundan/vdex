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

## Important Operational Notes

- A workspace row can exist even if the underlying sandbox died; APIs reconcile and mark it stopped.
- "Start" is only available when a workspace has a snapshot ID.
- Warm pool behavior is environment-configurable:
  - `WARM_POOL_TARGET`
  - `WARM_POOL_AUTO_REPLENISH`
- On local development (`localhost`), service calls are routed through same-origin API proxy paths to avoid CORS issues.

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
