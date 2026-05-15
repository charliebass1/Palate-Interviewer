# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Next.js dev server at localhost:3000
npm run build        # production build
npm run lint         # ESLint via next lint
npm run typecheck    # tsc --noEmit (no test runner; this is the primary correctness check)
npm run smoke        # end-to-end pipeline test (requires .env.local with Anthropic + Supabase)
```

The smoke script (`scripts/smoke.ts`) exercises the full Claude pipeline — guide generation, per-interview analysis, theme synthesis — without a live Vapi call. Cost ~$0.03 on Haiku 4.5. Run with `SEED_USER_ID=<uuid>` if multiple Supabase users exist.

No unit test framework is configured. `npm run typecheck` and `npm run smoke` are the primary verification tools.

## Architecture

**Palate Interviewer** is a Next.js 15 App Router application that automates B2B foodservice expert interview research. The end-to-end flow is:

1. Researcher uploads PDFs/docs → materials parsed to `extracted_text`
2. Claude generates a structured discussion guide from the extracted text
3. Vapi places an outbound phone call using the guide as the AI interviewer's context
4. On call end, Vapi webhook fires → transcript persisted → Claude analyzes transcript
5. After multiple interviews, Claude synthesizes cross-interview themes

Services:
| Concern | Service |
|---|---|
| Hosting / SSR | Vercel / Next.js 15 |
| Auth + DB + Storage | Supabase (Postgres + RLS, magic-link, `materials` bucket) |
| LLM | Anthropic Claude (guide gen, analysis, synthesis) |
| Voice orchestration | Vapi (outbound call, STT via Deepgram Nova-3, TTS via ElevenLabs) |

## Supabase Client Pattern

Three clients exist — never use the wrong one:

- `supabaseServer()` (`src/lib/supabase/server.ts`) — async, cookie-forwarding, RLS **on**. Use in API routes for user-owned data.
- `supabaseAdmin()` (`src/lib/supabase/server.ts`) — sync, secret key, RLS **bypassed**. Use in webhook handlers, background jobs, and the shared lib functions (`generate-guide.ts`, `analyze.ts`, `synthesize.ts`).
- `supabaseBrowser()` (`src/lib/supabase/client.ts`) — client components only.

## Environment Variables

All env vars are validated by Zod at startup via `src/lib/env.ts`. Call `env()` everywhere instead of reading `process.env` directly — it caches and throws a descriptive error on misconfiguration.

Supabase renamed keys in late 2025. The env loader accepts both formats:
- New: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`
- Legacy: `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`

Vapi credentials (`VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`) are optional — the upload + guide generation flow works without them. Live calls require all three plus `VAPI_WEBHOOK_SECRET`.

`NEXT_PUBLIC_ENABLE_DEV_TOOLS=true` enables a paste-in transcript panel on the project page that bypasses a real call. `DEBUG_DISABLED=false` (default) exposes `/debug` — a pre-flight health check page that verifies env vars, Supabase table presence, and API reachability.

## Claude Integration Pattern

All three Claude operations follow the same pattern in `src/lib/`:

```
generate-guide.ts   →  prompts/guide-generator.ts
analyze.ts          →  prompts/post-call-analyzer.ts
synthesize.ts       →  prompts/theme-synthesizer.ts
```

Each lib function:
1. Uses `anthropic().messages.stream(...)` with the system prompt marked `cache_control: { type: "ephemeral" }` for prompt caching
2. Expects Claude to return **only JSON** — the raw text is JSON-extracted via `text.indexOf("{")` / `text.lastIndexOf("}")` and `JSON.parse`
3. Saves results to Supabase via `supabaseAdmin()`
4. Returns a discriminated union `{ ok: true, ... } | { ok: false, status, error, raw? }`

The default model is `claude-haiku-4-5` (set via `ANTHROPIC_MODEL`). The `BASE_REQUEST` constant in `src/lib/anthropic.ts` is intentionally empty for Haiku — uncommenting `thinking` and `output_config.effort` enables extended thinking on Sonnet/Opus.

These lib functions are shared between API routes and the smoke script — do not add HTTP-specific logic to them.

## Vapi Webhook Flow

`POST /api/vapi/webhook` (`src/app/api/vapi/webhook/route.ts`) handles Vapi lifecycle events. It:
- HMAC-verifies every request using `VAPI_WEBHOOK_SECRET` (timing-safe comparison)
- Handles event aliasing (`call.started` / `call-started` / `status-update`, `call.ended` / `call-ended` / `end-of-call-report`)
- Is idempotent: checks for existing transcript before inserting, uses `.is("started_at", null)` and `.neq("status", "completed")` guards
- Fire-and-forgets the post-call analyzer via a fresh `fetch` to `/api/analysis/summarize` so the webhook returns in <1s

The `vapi_call_id` column on `interviews` has a partial unique index for deduplication.

## Database Schema

Seven tables, all owner-scoped via RLS (policy joins back to `projects.owner_id = auth.uid()`):

```
projects → materials → (extracted_text used for guide gen)
         → interview_guides (guide_json: {objective, persona_target, sections:[{title, minutes, questions:[{text, probes, why_it_matters}]}]})
         → interviews → transcripts (raw_text or segments jsonb [{speaker, start_ms, end_ms, text}])
                      → summaries (insights, quotes, sentiment, follow_up_flags jsonb)
         → themes (cross-interview synthesis, replaced wholesale on each synthesize call)
```

Storage: private `materials` bucket. Object path: `{project_id}/{material_id}/{filename}`. RLS policies on `storage.objects` enforce project ownership via `split_part(name, '/', 1)`.

Migrations live in `supabase/migrations/` and are applied in order via `supabase db push`.

## API Route Conventions

All routes under `src/app/api/`:
- Authenticate by calling `supabaseServer()` then checking `sb.auth.getUser()` — return 401 if no user
- Validate request bodies with Zod before touching the database
- Use `supabaseServer()` for ownership-checked reads, `supabaseAdmin()` for writes that the server initiates on behalf of the user (e.g. parse status updates, transcript inserts)
- Routes that do heavy I/O set `export const runtime = "nodejs"` and `export const maxDuration`

The dev-only route `POST /api/dev/test-transcript` is gated by `NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true"` checked at the route handler level.

## Project Page Architecture

`src/app/projects/[id]/page.tsx` is a server component that fetches all project data in a single parallel `Promise.all` and passes it down as props to client panel components. The page is `force-dynamic`. Each panel (Materials, Guide, Interviews, Summaries, Themes, Voice) is a separate `*-panel.tsx` client component that manages its own mutation state and calls the relevant API routes.
