// Service health checks used by the /debug page. Each checker returns a
// single ReportRow so the page can render a simple green/red/muted table.
// All checks run in parallel and any single failure only blanks its own row.
//
// Deliberately uses process.env directly for presence checks rather than
// env() so a broken .env.local (zod throws) still produces a useful
// per-variable report. Reachability checks reuse the existing clients.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { listVoices } from "./elevenlabs";
import { isMockMode } from "./mock/config";

export type RowStatus = "ok" | "warn" | "error" | "missing";

export type ReportRow = {
  name: string;
  status: RowStatus;
  detail: string;
  remediation?: string;
};

const REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "APP_URL",
] as const;

// Each tuple: (preferred new name, legacy fallback name). The row is OK
// if either is set; the detail says which one we picked up.
const REQUIRED_EITHER_ENV: [string, string][] = [
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
];

const OPTIONAL_ENV = [
  "VAPI_API_KEY",
  "VAPI_WEBHOOK_SECRET",
  "VAPI_ASSISTANT_ID",
  "VAPI_PHONE_NUMBER_ID",
  "ELEVENLABS_API_KEY",
  "DEEPGRAM_API_KEY",
] as const;

const CORE_TABLES = [
  "projects",
  "materials",
  "interview_guides",
  "interviews",
  "transcripts",
  "summaries",
  "themes",
] as const;

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function eitherRow(preferred: string, legacy: string): ReportRow {
  if (present(preferred)) {
    return { name: preferred, status: "ok", detail: "present (new format)" };
  }
  if (present(legacy)) {
    return {
      name: preferred,
      status: "warn",
      detail: `using legacy ${legacy} — works, but Supabase recommends rotating to the new ${preferred}`,
    };
  }
  return {
    name: preferred,
    status: "missing",
    detail: "not set",
    remediation: `Set ${preferred} (or legacy ${legacy}) in .env.local from Supabase → Project Settings → API Keys`,
  };
}

function envRow(name: string, required: boolean): ReportRow {
  if (present(name)) {
    return { name, status: "ok", detail: "present" };
  }
  return required
    ? {
        name,
        status: "missing",
        detail: "not set",
        remediation: `Set ${name} in .env.local`,
      }
    : {
        name,
        status: "warn",
        detail: "not set (optional)",
      };
}

async function checkAnthropic(): Promise<ReportRow> {
  const name = "Anthropic API";
  if (!present("ANTHROPIC_API_KEY")) {
    return {
      name,
      status: "missing",
      detail: "ANTHROPIC_API_KEY not set",
      remediation: "Add ANTHROPIC_API_KEY from console.anthropic.com",
    };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const res = await client.models.list({ limit: 5 });
    const count = res.data.length;
    return { name, status: "ok", detail: `reachable — ${count}+ models listed` };
  } catch (err) {
    return {
      name,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      remediation: "Verify ANTHROPIC_API_KEY is valid and not revoked",
    };
  }
}

async function checkSupabase(): Promise<ReportRow[]> {
  const name = "Supabase DB";
  const bucketName = "Supabase storage (materials bucket)";

  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!present("NEXT_PUBLIC_SUPABASE_URL") || !secretKey) {
    return [
      {
        name,
        status: "missing",
        detail: "URL or secret key not set",
        remediation: "Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) from Supabase → Project Settings → API Keys",
      },
    ];
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Test each core table in parallel. `limit(0)` returns no rows but still
  // validates the table exists and is readable by service-role.
  const tableChecks = await Promise.all(
    CORE_TABLES.map(async (t) => {
      const { error } = await admin.from(t).select("*", { head: true, count: "exact" }).limit(0);
      return { t, ok: !error, err: error?.message };
    }),
  );
  const missingTables = tableChecks.filter((r) => !r.ok);
  const dbRow: ReportRow = missingTables.length === 0
    ? { name, status: "ok", detail: `reachable — all ${CORE_TABLES.length} tables present` }
    : {
        name,
        status: "error",
        detail: `missing or unreadable: ${missingTables.map((r) => r.t).join(", ")}`,
        remediation: "Run supabase/migrations/0001_init.sql and 0003_project_voice.sql against your project",
      };

  // Storage bucket check — getBucket returns an error if missing.
  let bucketRow: ReportRow;
  try {
    const { data, error } = await admin.storage.getBucket("materials");
    bucketRow = data && !error
      ? { name: bucketName, status: "ok", detail: "bucket exists" }
      : {
          name: bucketName,
          status: "error",
          detail: error?.message ?? "bucket not found",
          remediation: "Run supabase/migrations/0002_storage.sql",
        };
  } catch (err) {
    bucketRow = {
      name: bucketName,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      remediation: "Run supabase/migrations/0002_storage.sql",
    };
  }

  return [dbRow, bucketRow];
}

async function checkVapi(): Promise<ReportRow> {
  const name = "Vapi API";
  if (!present("VAPI_API_KEY")) {
    return {
      name,
      status: "warn",
      detail: "not configured (live-call path disabled; paste-in transcript still works)",
      remediation: "Add VAPI_API_KEY from vapi.ai → Settings once you want live calls",
    };
  }
  try {
    const res = await fetch("https://api.vapi.ai/assistant?limit=1", {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    });
    if (!res.ok) {
      return {
        name,
        status: "error",
        detail: `HTTP ${res.status} ${res.statusText}`,
        remediation: "Verify VAPI_API_KEY is valid and not revoked",
      };
    }
    return { name, status: "ok", detail: "reachable" };
  } catch (err) {
    return {
      name,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
    };
  }
}

async function checkElevenLabs(): Promise<ReportRow> {
  const name = "ElevenLabs";
  if (!present("ELEVENLABS_API_KEY")) {
    return {
      name,
      status: "warn",
      detail: "not configured (Vapi falls back to a default voice)",
    };
  }
  try {
    const { voices } = await listVoices();
    return { name, status: "ok", detail: `reachable — ${voices.length} voices available` };
  } catch (err) {
    return {
      name,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      remediation: "Verify ELEVENLABS_API_KEY is valid",
    };
  }
}

export type HealthReport = {
  rows: ReportRow[];
  overall: RowStatus;
};

export async function healthReport(): Promise<HealthReport> {
  // Mock mode runs with no real backend, so skip the live reachability probes
  // (they'd fail on placeholder keys) and report the demo wiring instead.
  if (isMockMode()) {
    return {
      overall: "warn",
      rows: [
        {
          name: "Mock mode",
          status: "warn",
          detail:
            "Active — the app is running on an in-memory store, deterministic mock LLM output, and simulated calls. No external services are used.",
          remediation:
            "To switch to the live backend, set Supabase + Anthropic (+ optional Vapi) vars in .env.local, or set PALATE_MOCK_MODE=false.",
        },
        { name: "In-memory database", status: "ok", detail: "seeded — 2 demo projects ready" },
        { name: "Mock LLM (guide / analysis / synthesis)", status: "ok", detail: "deterministic, derived from inputs" },
        { name: "Simulated call pipeline", status: "ok", detail: "scheduling an interview generates a transcript + summary" },
        { name: "Auth", status: "ok", detail: `bypassed — signed in as demo user` },
      ],
    };
  }

  const envRows: ReportRow[] = [
    ...REQUIRED_ENV.map((n) => envRow(n, true)),
    ...REQUIRED_EITHER_ENV.map(([preferred, legacy]) => eitherRow(preferred, legacy)),
    ...OPTIONAL_ENV.map((n) => envRow(n, false)),
  ];

  const [anthropic, supabaseRows, vapi, elevenlabs] = await Promise.all([
    checkAnthropic(),
    checkSupabase(),
    checkVapi(),
    checkElevenLabs(),
  ]);

  const rows = [...envRows, anthropic, ...supabaseRows, vapi, elevenlabs];

  const anyError = rows.some((r) => r.status === "error" || r.status === "missing");
  const anyWarn = rows.some((r) => r.status === "warn");
  const overall: RowStatus = anyError ? "error" : anyWarn ? "warn" : "ok";

  return { rows, overall };
}
