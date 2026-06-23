# CLAUDE.md

Orientation for AI agents working in this repo. Keep it current when the
architecture changes.

## What this is

**Palate Interviewer** — an autonomous AI interviewer for B2B foodservice
expert discussion calls. The pipeline:

```
upload research materials → Claude generates a 30-min interview guide →
Vapi dials the expert and runs an adaptive call → transcript + per-call
summary → cross-interview theme synthesis
```

Stack: Next.js 15 (App Router), React 19, Tailwind v4, TypeScript (strict),
Supabase (auth + Postgres + storage), Anthropic Claude, Vapi (voice). Node 20+.

## Run it

```bash
npm install
npm run dev        # mock mode by default — no credentials needed
npm run build      # production build
npm run typecheck  # tsc --noEmit — must stay clean
npm run lint
npm run smoke      # live end-to-end (needs real Supabase + Anthropic in .env.local)
```

The bar for any change: **`npm run typecheck` and `npm run build` stay clean.**

## Mock mode (important)

The app runs with **zero external credentials** in mock mode, which is on
automatically whenever Supabase isn't configured (force with
`PALATE_MOCK_MODE=true|false`). This is what makes the prototype shareable.

It is gated entirely behind `isMockMode()` (`src/lib/mock/config.ts`) at three
boundaries, so **the real code paths are untouched** — going live is a config
change, not a rewrite:

- **Data + auth** — `supabaseServer()` / `supabaseAdmin()` return an in-memory
  stand-in (`src/lib/mock/supabase.ts`) implementing the slice of the Supabase
  client the app uses. Auth resolves to a fixed demo user; middleware + login
  are bypassed.
- **LLM** — `generate-guide.ts`, `analyze.ts`, `synthesize.ts` branch at the
  Claude call to deterministic helpers in `src/lib/mock/llm.ts` that derive
  output from real inputs (materials → guide, transcript → summary, summaries →
  themes).
- **Voice** — `simulateMockInterview()` (`src/lib/mock/simulate.ts`) stands in
  for the Vapi call → webhook → transcript → analysis chain.

The store (`src/lib/mock/store.ts`) is seeded once per process and kept on
`globalThis`. It assumes a single long-lived server; mutations reset on
restart.

**When adding a feature that talks to Supabase/Anthropic/Vapi, add the matching
mock branch** so the demo keeps working end-to-end.

## Layout

```
src/
  app/
    api/                 # server routes (auth via Supabase cookies; webhook via HMAC)
    projects/[id]/       # the main dashboard: materials, guide, interviews, summaries, themes panels
    debug/               # /debug pre-flight health page (mock-aware)
    demo-banner.tsx      # "Demo mode" top bar, shown only in mock mode
  lib/
    supabase/            # server / browser / middleware clients (mock-aware)
    anthropic.ts vapi.ts elevenlabs.ts env.ts health.ts
    generate-guide.ts analyze.ts synthesize.ts   # shared by routes + smoke
    prompts/             # system prompts (output contracts documented in comments)
    mock/                # the zero-credential demo layer (see above)
  middleware.ts          # Supabase session refresh (skipped in mock mode)
supabase/migrations/     # schema + RLS + storage bucket
fixtures/                # sample brief + 3 canned transcripts (used by seed + smoke)
scripts/smoke.ts         # live end-to-end verification
```

Data model lives in `supabase/migrations/0001_init.sql`: `projects`,
`materials`, `interview_guides`, `interviews`, `transcripts`, `summaries`,
`themes` — all owner-scoped via RLS.

## Conventions

- Shared business logic (guide/analyze/synthesize) lives in `src/lib/*.ts` and
  is reused by both the API route and the smoke script — don't duplicate it
  into routes.
- LLM functions stream from Claude and parse the first `{...}` block as JSON;
  prompt files document the exact output contract.
- Env is validated once via `env()` (zod). Public values go through
  `publicEnv()`. `NEXT_PUBLIC_*` only for browser-safe values.
- Match the surrounding style: small typed components, Tailwind utility
  classes, no client state libraries.

## Model identity

When building or editing LLM calls, default to current Claude models. The
`ANTHROPIC_MODEL` default is `claude-haiku-4-5` (cheap/fast); higher quality is
`claude-sonnet-4-6` / `claude-opus-4-7`. See `src/lib/anthropic.ts` for the
note on enabling effort/adaptive thinking on the larger models.
