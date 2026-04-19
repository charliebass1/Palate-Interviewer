# Palate Interviewer

Autonomous AI interviewer for B2B foodservice expert discussion calls.
Upload research materials → Claude generates a tailored 30-min guide →
Vapi dials the expert and runs an adaptive conversation → transcript,
quotes, and insights are returned and synthesized across 5–20 calls.

> Prototype status: end-to-end flow is implemented and typechecks
> clean. No external service is wired up yet — follow the setup below.

---

## Architecture at a glance

| Concern             | Service          | What it does here                                   |
| ------------------- | ---------------- | --------------------------------------------------- |
| Hosting / SSR       | Vercel           | Runs the Next.js 15 app                             |
| Auth + DB + storage | Supabase         | Postgres + RLS, magic-link auth, file storage       |
| LLM                 | Anthropic Claude | Guide generation, post-call analysis, theme synth   |
| Voice orchestration | Vapi             | Outbound call, STT, TTS, webhook lifecycle          |
| STT                 | Deepgram         | Configured inside Vapi (Nova-3)                     |
| TTS                 | ElevenLabs       | Configured inside Vapi (voice ID env)               |

Runtime: Node.js 20+. App router, React 19, Tailwind v4.

---

## Prerequisites

You need accounts/keys for:

1. **Supabase** — free tier is fine for the prototype.
2. **Anthropic** — API key from `console.anthropic.com`.
3. **Vapi** — `vapi.ai` account, API key, one provisioned phone number.
4. **Vercel** (optional, only needed for hosted deploy).

You do **not** need Deepgram or ElevenLabs accounts directly — Vapi
manages those credentials internally if you use Vapi's hosted defaults.
You only need direct keys if you want to call those APIs yourself.

---

## Setup

### 1. Clone, install, copy env

```bash
git clone https://github.com/charliebass1/palate-interviewer.git
cd palate-interviewer
npm install
cp .env.example .env.local
```

### 2. Supabase — project, schema, auth, storage

1. Create a new project at `app.supabase.com`. Pick a region close to
   your Vercel region.
2. From **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only,
     never expose this in the browser)
3. Apply the two migrations. Easiest path:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This runs `supabase/migrations/0001_init.sql` (tables + RLS) and
   `0002_storage.sql` (the `materials` storage bucket + per-owner
   bucket policies).

   If you'd rather do it manually, paste the contents of both files
   into the Supabase SQL editor and run them in order.
4. **Auth → Providers → Email**: enable. The default magic-link
   provider works for the prototype with no SMTP configuration.
5. **Auth → URL Configuration**:
   - **Site URL** = `http://localhost:3000` for local dev (swap to
     your Vercel URL once deployed).
   - **Additional Redirect URLs** = `http://localhost:3000/auth/callback`
     (and the prod equivalent).

### 3. Anthropic

Drop your API key into `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5
```

`claude-haiku-4-5` is the cheap default. Upgrade to
`claude-sonnet-4-6` or `claude-opus-4-7` for higher-quality guides;
if you do, also re-enable `effort` and adaptive thinking in
`src/lib/anthropic.ts` (the comment in `BASE_REQUEST` shows what to
uncomment).

### 4. Vapi

1. Create an account at `vapi.ai` and grab your API key
   (`VAPI_API_KEY`).
2. Provision a phone number under **Phone Numbers** in the Vapi
   dashboard. Copy the `phoneNumberId` → `VAPI_PHONE_NUMBER_ID`.
3. Generate a webhook secret (any random hex string) →
   `VAPI_WEBHOOK_SECRET`. The webhook route HMAC-verifies this.
4. Leave `VAPI_ASSISTANT_ID` empty for now — you'll mint it after the
   app is running.

### 5. Run locally

```bash
npm run dev
# open http://localhost:3000
```

Sign in with your email, click the magic link, and you'll land on
`/projects`.

### 6. Mint the Vapi assistant

The assistant's system prompt and webhook URL come from
`src/lib/vapi.ts`. Once the app is reachable (locally via `ngrok`, or
deployed), run:

```bash
curl -X POST http://localhost:3000/api/vapi/assistant \
  -H "Cookie: <your supabase auth cookies>" \
  -H "Content-Type: application/json" \
  -d '{}'
# → { "assistant_id": "asst_...", "updated": false }
```

Copy `assistant_id` into `.env.local` as `VAPI_ASSISTANT_ID` and
restart `npm run dev`. From here on, scheduling an interview with
"Dial now" + a phone number will place the call.

> The `serverUrl` baked into the assistant points at
> `${APP_URL}/api/vapi/webhook`. For local testing, set `APP_URL` to
> your `ngrok` URL and re-POST `/api/vapi/assistant` (it will update
> the existing assistant in place).

### 7. Deploy to Vercel (optional but recommended)

1. Push your branch and import the repo into Vercel.
2. Add **all** the env vars from `.env.example` to the Vercel project.
   Set `APP_URL` to your `*.vercel.app` URL.
3. Deploy. Once live, re-POST `/api/vapi/assistant` so the assistant's
   `serverUrl` points at the production webhook.

---

## End-to-end smoke test

1. Sign in.
2. **Create project** — give it a name + topic.
3. **Upload material** — at least one PDF or TXT.
4. **Generate guide** — Claude returns 4–5 sections, 6–8 questions.
5. **Schedule interview** — fill in expert name + role + segment.
6. **Dial now** (only if Vapi is wired up): tick the box, enter an
   E.164 phone number, hit Schedule & dial. The expert receives the
   call.
7. When the call ends, the Vapi webhook flips the interview to
   `completed`, persists the transcript, and triggers
   `/api/analysis/summarize`. The Summaries panel auto-shows after a
   page refresh.
8. Run **Synthesize** in the Themes panel after at least one summary.

---

## Environment variables

| Var                             | Required | Notes                                  |
| ------------------------------- | -------- | -------------------------------------- |
| `ANTHROPIC_API_KEY`             | yes      | From console.anthropic.com             |
| `ANTHROPIC_MODEL`               | no       | Default `claude-haiku-4-5`             |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes      | Supabase project URL                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes      | Supabase anon key                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | yes      | Server-only; bypasses RLS              |
| `VAPI_API_KEY`                  | yes*     | Required if you want live calls        |
| `VAPI_WEBHOOK_SECRET`           | yes*     | HMAC-verified on /api/vapi/webhook     |
| `VAPI_ASSISTANT_ID`             | yes*     | Set after first POST /api/vapi/assistant |
| `VAPI_PHONE_NUMBER_ID`          | yes*     | From Vapi dashboard                    |
| `DEEPGRAM_API_KEY`              | no       | Only if proxying Deepgram directly     |
| `ELEVENLABS_API_KEY`            | no       | Only if proxying ElevenLabs directly   |
| `LLAMA_CLOUD_API_KEY`           | no       | Reserved for future PDF parsing upgrade |
| `APP_URL`                       | yes      | Used in OAuth + Vapi webhook URL       |

`*` = required for the live-call path. The upload + guide generation
flow works without any Vapi credentials.

---

## API reference (internal)

All routes live under `src/app/api/`. Auth is via Supabase session
cookies; the Vapi webhook uses HMAC-SHA256 of the raw body.

| Method | Path                          | Purpose                                          |
| ------ | ----------------------------- | ------------------------------------------------ |
| GET    | `/api/projects`               | List projects for the signed-in user             |
| POST   | `/api/projects`               | Create a project                                 |
| POST   | `/api/materials/upload-url`   | Insert material row + return signed upload URL   |
| POST   | `/api/materials/parse`        | Extract text from uploaded file                  |
| POST   | `/api/guides/generate`        | Claude generates a discussion guide              |
| GET    | `/api/interviews`             | List interviews (filter by `?project_id=`)       |
| POST   | `/api/interviews`             | Create interview, optionally dial via Vapi       |
| POST   | `/api/vapi/assistant`         | Create or update the Vapi assistant config       |
| POST   | `/api/vapi/webhook`           | Vapi lifecycle webhook (HMAC-verified)           |
| POST   | `/api/analysis/summarize`     | Claude post-call analysis from a transcript      |
| POST   | `/api/themes/synthesize`      | Claude cross-interview theme synthesis           |
| GET    | `/auth/callback`              | Magic-link redirect target                       |
| POST   | `/auth/sign-out`              | Sign out                                         |

---

## Known gaps before "demo-ready"

- **No paste-in transcript path.** To exercise the summary/themes UI
  end-to-end without a real Vapi call, you'd need to either run a
  Vapi web/phone call or insert rows directly via SQL. A small
  `/api/dev/test-transcript` endpoint would solve this in ~30 lines.
- **No in-browser web call.** The interview scheduler only supports
  outbound phone via E.164. Vapi also supports browser-based web calls
  — wiring those into a "Start call now" button on the project page
  would remove the need for a phone number during demos.
- **No re-parse button.** If material parsing fails, you currently
  have to delete and re-upload.
- **Guide generation is non-RAG.** It concatenates up to 180K
  characters of `extracted_text` and sends to Claude in one shot.
  Larger corpora are silently truncated. RAG comes back in a future
  update alongside Google Drive linking.

---

## Project structure

```
src/
  app/
    api/                     # all server routes
    auth/                    # magic-link callback + sign-out
    login/                   # /login page
    projects/                # researcher dashboard
      [id]/                  # per-project page (materials, guide, interviews, summaries, themes)
  lib/
    anthropic.ts             # Claude SDK wrapper + default model
    env.ts                   # zod-validated env loader
    supabase/                # server, browser, middleware clients
    vapi.ts                  # Vapi REST wrapper + assistant config builder
    prompts/                 # guide, interviewer, analyzer, theme prompts
  middleware.ts              # Supabase session refresh
supabase/
  migrations/
    0001_init.sql            # core schema + RLS
    0002_storage.sql         # materials bucket + bucket policies
```
