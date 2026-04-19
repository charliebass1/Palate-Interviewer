-- Per-project ElevenLabs voice selection. Nullable — when null, the Vapi
-- assistant falls back to the built-in default in src/lib/vapi.ts.

alter table public.projects
  add column if not exists voice_id text,
  add column if not exists voice_name text;
