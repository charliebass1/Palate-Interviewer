// Simulates a Vapi call end-to-end in mock mode.
//
// Stands in for the real outbound-call → webhook → transcript → analysis
// chain: it synthesizes a transcript from the project's guide, persists it,
// flips the interview to completed, and runs the (mock) post-call analyzer —
// so scheduling an interview in the demo yields a full summary with no phone
// number and no external services.

import { supabaseAdmin } from "../supabase/server";
import { summarizeInterview } from "../analyze";
import { mockTranscriptFor, type GuideJson } from "./llm";

export async function simulateMockInterview(interviewId: string): Promise<void> {
  const admin = supabaseAdmin();

  const { data: interview } = await admin
    .from("interviews")
    .select("id, expert_name, expert_role, expert_segment, guide_id")
    .eq("id", interviewId)
    .single();
  if (!interview) return;

  let guideJson: GuideJson | null = null;
  if (interview.guide_id) {
    const { data: guide } = await admin
      .from("interview_guides")
      .select("guide_json")
      .eq("id", interview.guide_id)
      .single();
    guideJson = (guide?.guide_json as GuideJson | undefined) ?? null;
  }

  const startedAt = new Date(Date.now() - 1740 * 1000).toISOString();
  await admin
    .from("interviews")
    .update({ status: "in_progress", started_at: startedAt, vapi_call_id: `mock-${interviewId.slice(0, 8)}` })
    .eq("id", interviewId);

  const transcript = mockTranscriptFor({
    expertName: interview.expert_name ?? "Expert",
    expertRole: interview.expert_role,
    expertSegment: interview.expert_segment,
    guideJson,
  });

  await admin.from("transcripts").insert({
    interview_id: interviewId,
    source: "vapi",
    raw_text: transcript,
  });

  await admin
    .from("interviews")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      duration_sec: 1740,
    })
    .eq("id", interviewId);

  // Mirrors the webhook: kick off post-call analysis.
  await summarizeInterview(interviewId);
}
