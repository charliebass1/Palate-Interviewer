import { supabaseAdmin } from "./supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "./anthropic";
import { THEME_SYNTHESIZER_SYSTEM } from "./prompts/theme-synthesizer";

export type SynthesizeResult =
  | { ok: true; themes: ThemeRow[] }
  | { ok: false; status: number; error: string; raw?: string };

export type ThemeRow = {
  title: string;
  description: string | null;
  supporting_quotes: unknown;
  confidence: number | null;
};

// Shared across the /api/themes/synthesize route and the smoke script.
// Uses the admin client since both callers are trusted server contexts.
export async function synthesizeThemes(projectId: string): Promise<SynthesizeResult> {
  const admin = supabaseAdmin();

  const { data: summaries } = await admin
    .from("summaries")
    .select("interview_id, insights, quotes, sentiment, follow_up_flags")
    .eq("project_id", projectId);
  if (!summaries || summaries.length === 0) {
    return { ok: false, status: 400, error: "no summaries yet" };
  }

  const packed = summaries.map((s) => ({
    interview_id: s.interview_id,
    insights: s.insights,
    quotes: s.quotes,
    sentiment: s.sentiment,
  }));

  const model = defaultModel();
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 6_000,
    system: [
      { type: "text", text: THEME_SYNTHESIZER_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Per-interview summaries (JSON):\n${JSON.stringify(packed, null, 2)}\n\nProduce the themes JSON now.`,
      },
    ],
    ...BASE_REQUEST,
  });

  const final = await stream.finalMessage();
  const raw = final.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  let out: { themes?: unknown[] };
  try {
    out = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { ok: false, status: 502, error: "themes JSON parse failed", raw: raw.slice(0, 4000) };
  }
  type RawTheme = {
    title?: string; description?: string; supporting_quotes?: unknown; confidence?: number;
  };
  const parsed: RawTheme[] = Array.isArray(out.themes) ? (out.themes as RawTheme[]) : [];

  const rows: ThemeRow[] = parsed.map((t) => ({
    title: t.title ?? "Untitled theme",
    description: t.description ?? null,
    supporting_quotes: t.supporting_quotes ?? [],
    confidence: t.confidence ?? null,
  }));

  await admin.from("themes").delete().eq("project_id", projectId);
  if (rows.length) {
    const { error } = await admin.from("themes").insert(
      rows.map((r) => ({ project_id: projectId, ...r, model })),
    );
    if (error) return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, themes: rows };
}
