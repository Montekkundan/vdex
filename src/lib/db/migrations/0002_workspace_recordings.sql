CREATE TYPE "public"."recording_mode" AS ENUM('cli', 'gui');
CREATE TYPE "public"."recording_status" AS ENUM('idle', 'recording', 'finalizing', 'completed', 'failed', 'expired');
CREATE TYPE "public"."recording_visibility" AS ENUM('private', 'public');
CREATE TYPE "public"."recording_mp4_status" AS ENUM('not_requested', 'queued', 'processing', 'ready', 'failed');

CREATE TABLE "workspace_recordings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "workspace_id" uuid,
  "sandbox_id" text,
  "mode" "recording_mode" NOT NULL,
  "status" "recording_status" DEFAULT 'recording' NOT NULL,
  "visibility" "recording_visibility" DEFAULT 'private' NOT NULL,
  "title" text,
  "public_id" text,
  "mp4_status" "recording_mp4_status" DEFAULT 'not_requested' NOT NULL,
  "mp4_storage_key" text,
  "mp4_size_bytes" bigint,
  "mp4_ready_at" timestamp,
  "mp4_error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "ended_at" timestamp,
  "duration_ms" integer,
  "expires_at" timestamp NOT NULL,
  "size_bytes" bigint DEFAULT 0 NOT NULL,
  "meta" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "recording_terminal_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
  "recording_id" uuid NOT NULL,
  "t_ms" integer NOT NULL,
  "event_type" text NOT NULL,
  "payload" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "recording_video_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recording_id" uuid NOT NULL,
  "seq" integer NOT NULL,
  "t_start_ms" integer NOT NULL,
  "t_end_ms" integer NOT NULL,
  "storage_key" text NOT NULL,
  "byte_size" bigint DEFAULT 0 NOT NULL,
  "mime_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "recording_terminal_events" ADD CONSTRAINT "recording_terminal_events_recording_id_workspace_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."workspace_recordings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recording_video_chunks" ADD CONSTRAINT "recording_video_chunks_recording_id_workspace_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."workspace_recordings"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "workspace_recordings_public_id_unique" ON "workspace_recordings" USING btree ("public_id");
CREATE INDEX "workspace_recordings_user_created_idx" ON "workspace_recordings" USING btree ("user_id", "created_at");
CREATE INDEX "workspace_recordings_workspace_created_idx" ON "workspace_recordings" USING btree ("workspace_id", "created_at");
CREATE INDEX "workspace_recordings_status_expires_idx" ON "workspace_recordings" USING btree ("status", "expires_at");
CREATE INDEX "workspace_recordings_user_mp4_status_idx" ON "workspace_recordings" USING btree ("user_id", "mp4_status");
CREATE INDEX "recording_terminal_events_recording_time_idx" ON "recording_terminal_events" USING btree ("recording_id", "t_ms");
CREATE UNIQUE INDEX "recording_video_chunks_recording_seq_unique" ON "recording_video_chunks" USING btree ("recording_id", "seq");
CREATE INDEX "recording_video_chunks_recording_start_idx" ON "recording_video_chunks" USING btree ("recording_id", "t_start_ms");
