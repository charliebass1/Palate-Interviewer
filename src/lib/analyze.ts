import { supabaseAdmin } from "./supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "./anthropic";
import {
  POST_CALL_ANALYZER_SYSTEM,
  buildAnalyzerUserPrompt,
} from "./prompts/post-call-analyzer";
import { isMockMode } from "./mock/config";
import { mockSummaryFor, MOCK_MODEL } from "./mock/llm";

export type SummarizeResult =
  | { ok: true; summaryId: string }
  | { ok: false; status: number; error: string; raw?: string };

// Shared post-call analyzer used by both the Vapi webhook path
// (/api/analysis/summarize) and the dev paste-in-transcript path
// (/api/dev/test-transcript). Uses the admin client because it runs from
// trusted server contexts.
export async function summarizeInterview(interviewId: string): Promise<SummarizeResult> {
  const admin = supabaseAdmin();

  const { data: interview } = await admin
    .from("interviews")
    .select("id, project_id, guide_id, expert_segment")
    .eq("id", interviewId)
    .single();
  if (!interview) return { ok: false, status: 404, error: "interview not found" };

  const { data: transcript } = await admin
    .from("transcripts")
    .select("raw_text, segments")
    .eq("interview_id", interview.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!transcript) return { ok: false, status: 400, error: "no transcript" };

  const text = transcript.raw_text ?? formatSegments(transcript.segments);
  if (!text) return { ok: false, status: 400, error: "empty transcript" };

  let guideObjective: string | null = null;
  if (interview.guide_id) {
    const { data: guide } = await admin
      .from("interview_guides")
      .select("objective")
      .eq("id", interview.guide_id)
      .single();
    guideObjective = guide?.objective ?? null;
  }

  const model = isMockMode() ? MOCK_MODEL : defaultModel();
  let out: SummaryJson;

  if (isMockMode()) {
    // Derive insights + verbatim quotes from the transcript itself.
    out = mockSummaryFor(text, {
      guideObjective,
      expertSegment: interview.expert_segment,
    }) as SummaryJson;
  } else {
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
    try {
      out = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as SummaryJson;
    } catch {
      return { ok: false, status: 502, error: "analyzer JSON parse failed", raw: raw.slice(0, 4000) };
    }
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

  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, summaryId: saved.id };
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
