import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { summarizeInterview } from "@/lib/analyze";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  project_id: z.string().uuid(),
  guide_id: z.string().uuid().optional(),
  expert_name: z.string().min(1).max(200),
  expert_role: z.string().max(200).optional(),
  expert_segment: z.string().max(100).optional(),
  transcript_text: z.string().min(40),
  duration_sec: z.number().int().positive().optional(),
});

// Dev-only: create a completed interview + transcript row from pasted text
// and run the post-call analyzer so the summaries/themes UI can be
// exercised without placing a real Vapi call.
//
// Gated by NEXT_PUBLIC_ENABLE_DEV_TOOLS so the route 404s in production.
export async function POST(req: NextRequest) {
  if (env().NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "true") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { transcript_text, duration_sec, ...interviewFields } = parsed.data;

  const now = new Date();
  const durSec = duration_sec ?? 1800;
  const startedAt = new Date(now.getTime() - durSec * 1000);

  const { data: interview, error: ivErr } = await sb
    .from("interviews")
    .insert({
      ...interviewFields,
      status: "completed",
      started_at: startedAt.toISOString(),
      ended_at: now.toISOString(),
      duration_sec: durSec,
    })
    .select()
    .single();
  if (ivErr || !interview) {
    return NextResponse.json({ error: ivErr?.message ?? "insert failed" }, { status: 500 });
  }

  const { error: tsErr } = await sb.from("transcripts").insert({
    interview_id: interview.id,
    source: "manual",
    raw_text: transcript_text,
  });
  if (tsErr) {
    return NextResponse.json({ error: tsErr.message }, { status: 500 });
  }

  const result = await summarizeInterview(interview.id);
  if (!result.ok) {
    return NextResponse.json(
      { interview, warning: result.error, raw: result.raw },
      { status: 200 },
    );
  }

  return NextResponse.json({ interview, summary_id: result.summaryId }, { status: 201 });
}
