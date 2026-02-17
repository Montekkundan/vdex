ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "last_sandbox_id" text,
  ADD COLUMN IF NOT EXISTS "timeout_ms" integer DEFAULT 2700000 NOT NULL,
  ADD COLUMN IF NOT EXISTS "runtime_started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "stop_reason" text,
  ADD COLUMN IF NOT EXISTS "stopped_at" timestamp;
