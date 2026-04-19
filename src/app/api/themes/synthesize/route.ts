import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "@/lib/anthropic";
import { THEME_SYNTHESIZER_SYSTEM } from "@/lib/prompts/theme-synthesizer";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ project_id: z.string().uuid() });

// Roll all per-interview summaries for a project up into 4–8 themes.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: summaries } = await sb
    .from("summaries")
    .select("interview_id, insights, quotes, sentiment, follow_up_flags")
    .eq("project_id", parsed.data.project_id);
  if (!summaries || summaries.length === 0) {
    return NextResponse.json({ error: "no summaries yet" }, { status: 400 });
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
    .map((b) => b.text).join("\n");

  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  let out: { themes?: unknown[] };
  try {
    out = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return NextResponse.json({ error: "themes JSON parse failed", raw: raw.slice(0, 4000) }, { status: 502 });
  }
  const themes = Array.isArray(out.themes) ? out.themes : [];

  await sb.from("themes").delete().eq("project_id", parsed.data.project_id);
  const rows = themes.map((t: {
    title?: string; description?: string; supporting_quotes?: unknown; confidence?: number;
  }) => ({
    project_id: parsed.data.project_id,
    title: t.title ?? "Untitled theme",
    description: t.description ?? null,
    supporting_quotes: t.supporting_quotes ?? [],
    confidence: t.confidence ?? null,
    model,
  }));
  if (rows.length) {
    const { error } = await sb.from("themes").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ themes: rows });
}
