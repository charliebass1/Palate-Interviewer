/**
 * End-to-end smoke test. Verifies each stage of the pipeline without
 * placing a real Vapi call:
 *
 *   project → material (extracted text pre-filled) → guide (Claude) →
 *   3 completed interviews + transcripts → per-call analyzer (Claude) →
 *   cross-interview theme synthesis (Claude)
 *
 * Run: `npm run smoke`
 *
 * Requires: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *           NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *           plus a signed-up user in Supabase (magic-link once via /login).
 *
 * Cost: ~$0.03 on Haiku 4.5. Free with a new Anthropic trial credit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "../src/lib/supabase/server";
import { generateGuide } from "../src/lib/generate-guide";
import { summarizeInterview } from "../src/lib/analyze";
import { synthesizeThemes } from "../src/lib/synthesize";
import { SEED_INTERVIEWS } from "../fixtures/transcripts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  process.stdout.write(`${DIM}·${RESET} ${label}... `);
  try {
    const out = await fn();
    const ms = Date.now() - start;
    process.stdout.write(`${GREEN}✓${RESET} ${DIM}${ms}ms${RESET}\n`);
    return out;
  } catch (err) {
    process.stdout.write(`${RED}✗${RESET}\n`);
    throw err;
  }
}

async function resolveOwnerId(): Promise<string> {
  const override = process.env.SEED_USER_ID;
  if (override) return override;

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const users = data.users;
  if (users.length === 0) {
    throw new Error(
      "No Supabase users yet. Start `npm run dev`, sign in via magic link at /login, then re-run.",
    );
  }
  if (users.length > 1) {
    const ids = users.map((u) => `  ${u.email ?? "(no email)"}  ${u.id}`).join("\n");
    throw new Error(
      `Multiple users found. Set SEED_USER_ID to pick one:\n${ids}`,
    );
  }
  return users[0].id;
}

async function main() {
  console.log(`${DIM}Palate smoke test${RESET}\n`);

  const ownerId = await step("Resolve owner user", resolveOwnerId);
  const admin = supabaseAdmin();

  // Idempotency: archive any prior smoke-test projects from this user so the
  // dashboard stays clean on repeated runs.
  await step("Clean up prior smoke-test projects", async () => {
    await admin
      .from("projects")
      .delete()
      .eq("owner_id", ownerId)
      .like("name", "Smoke Test — %");
  });

  const project = await step("Create project", async () => {
    const { data, error } = await admin
      .from("projects")
      .insert({
        owner_id: ownerId,
        name: `Smoke Test — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        topic: "LTO strategy in regional burger chains (premium chicken patty)",
        client: "Internal (smoke test)",
      })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message ?? "project insert failed");
    return data as { id: string; name: string };
  });

  const brief = readFileSync(
    resolve(process.cwd(), "fixtures/sample-brief.txt"),
    "utf8",
  );

  await step("Seed material with pre-parsed brief", async () => {
    const { error } = await admin.from("materials").insert({
      project_id: project.id,
      storage_path: `seed/${project.id}/sample-brief.txt`,
      filename: "sample-brief.txt",
      mime_type: "text/plain",
      size_bytes: brief.length,
      parse_status: "parsed",
      extracted_text: brief,
    });
    if (error) throw new Error(error.message);
  });

  const guide = await step("Generate discussion guide (Claude)", async () => {
    const res = await generateGuide(project.id);
    if (!res.ok) throw new Error(res.error + (res.raw ? `\n${res.raw.slice(0, 400)}` : ""));
    return res;
  });

  for (const [idx, fx] of SEED_INTERVIEWS.entries()) {
    const label = `Interview ${idx + 1}/${SEED_INTERVIEWS.length} (${fx.expert_name})`;

    const interviewId = await step(`${label} — insert + transcript`, async () => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - fx.duration_sec * 1000);
      const { data: iv, error: ivErr } = await admin
        .from("interviews")
        .insert({
          project_id: project.id,
          guide_id: guide.guideId,
          expert_name: fx.expert_name,
          expert_role: fx.expert_role,
          expert_segment: fx.expert_segment,
          status: "completed",
          started_at: startedAt.toISOString(),
          ended_at: now.toISOString(),
          duration_sec: fx.duration_sec,
        })
        .select()
        .single();
      if (ivErr || !iv) throw new Error(ivErr?.message ?? "interview insert failed");

      const { error: tsErr } = await admin.from("transcripts").insert({
        interview_id: iv.id,
        source: "manual",
        raw_text: fx.transcript,
      });
      if (tsErr) throw new Error(tsErr.message);
      return iv.id as string;
    });

    await step(`${label} — analyze (Claude)`, async () => {
      const res = await summarizeInterview(interviewId);
      if (!res.ok) throw new Error(res.error + (res.raw ? `\n${res.raw.slice(0, 400)}` : ""));
    });
  }

  const themes = await step("Synthesize themes across interviews (Claude)", async () => {
    const res = await synthesizeThemes(project.id);
    if (!res.ok) throw new Error(res.error + (res.raw ? `\n${res.raw.slice(0, 400)}` : ""));
    return res.themes;
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.log(
    `\n${GREEN}All stages passed.${RESET}\n` +
      `  Project: ${project.name}\n` +
      `  Themes generated: ${themes.length}\n` +
      `  View it: ${appUrl}/projects/${project.id}\n`,
  );
}

main().catch((err) => {
  console.error(`\n${RED}Smoke test failed:${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
