import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "@/lib/anthropic";
import {
  POST_CALL_ANALYZER_SYSTEM,
  buildAnalyzerUserPrompt,
} from "@/lib/prompts/post-call-analyzer";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ interview_id: z.string().uuid() });

// Invoked by the Vapi webhook once a call ends. Trusts its caller — in
// production, require a shared-secret header and verify it here.
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const admin = supabaseAdmin();

  const { data: interview } = await admin
    .from("interviews")
    .select("id, project_id, guide_id, expert_segment")
    .eq("id", parsed.data.interview_id)
    .single();
  if (!interview) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: transcript } = await admin
    .from("transcripts")
    .select("raw_text, segments")
    .eq("interview_id", interview.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!transcript) return NextResponse.json({ error: "no transcript" }, { status: 400 });

  const text = transcript.raw_text
    ?? formatSegments(transcript.segments);
  if (!text) return NextResponse.json({ error: "empty transcript" }, { status: 400 });

  let guideObjective: string | null = null;
  if (interview.guide_id) {
    const { data: guide } = await admin
      .from("interview_guides")
      .select("objective")
      .eq("id", interview.guide_id)
      .single();
    guideObjective = guide?.objective ?? null;
  }

  const model = defaultModel();
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 4_000,
    system: [
      { type: "text", text: POST_CALL_ANALYZER_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: buildAnalyzerUserPrompt({
          transcriptText: text.slice(0, 180_000),
          guideObjective,
          expertSegment: interview.expert_segment,
        }),
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
  let out: SummaryJson;
  try {
    out = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as SummaryJson;
  } catch {
    return NextResponse.json({ error: "analyzer JSON parse failed", raw: raw.slice(0, 4000) }, { status: 502 });
  }

  const { data: saved, error } = await admin.from("summaries").insert({
    interview_id: interview.id,
    project_id: interview.project_id,
    insights: out.insights ?? [],
    quotes: out.quotes ?? [],
    sentiment: out.sentiment ?? null,
    follow_up_flags: out.follow_up_flags ?? [],
    model,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ summary: saved });
}

type SummaryJson = {
  insights?: unknown;
  quotes?: unknown;
  sentiment?: unknown;
  follow_up_flags?: unknown;
  themes_hint?: unknown;
};

function formatSegments(segs: unknown): string {
  if (!Array.isArray(segs)) return "";
  return segs
    .map((s: { speaker?: string; text?: string; start_ms?: number }) =>
      `[${s.start_ms ?? 0}ms] ${s.speaker ?? "?"}: ${s.text ?? ""}`)
    .join("\n");
}
