import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Vapi webhook receiver. Handles the lifecycle events we care about:
//   call.started  → mark interview in_progress
//   call.ended    → persist transcript, mark completed, kick off analysis
//   transcript    → (optional) incremental transcript updates
//
// Verifies the `x-vapi-signature` header as an HMAC-SHA256 of the raw body
// using VAPI_WEBHOOK_SECRET. Rejects anything else.
export async function POST(req: NextRequest) {
  const secret = env().VAPI_WEBHOOK_SECRET;
  const rawBody = await req.text();

  if (secret) {
    const sig = req.headers.get("x-vapi-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const ok = sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: VapiEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const event = payload.type ?? payload.message?.type;
  const call = payload.call ?? payload.message?.call;
  const callId = call?.id;

  if (!callId) return NextResponse.json({ ok: true, ignored: true });

  const { data: interview } = await admin
    .from("interviews")
    .select("id, project_id, status")
    .eq("vapi_call_id", callId)
    .single();
  if (!interview) return NextResponse.json({ ok: true, no_match: true });

  switch (event) {
    case "call.started":
    case "call-started":
    case "status-update": {
      if (call?.status === "in-progress" || event !== "status-update") {
        // Idempotent: only set started_at if still null so retries don't
        // shift the start time, and skip the status update once we've
        // already moved past in_progress.
        await admin.from("interviews")
          .update({ status: "in_progress", started_at: new Date().toISOString() })
          .eq("id", interview.id)
          .is("started_at", null);
      }
      break;
    }

    case "call.ended":
    case "call-ended":
    case "end-of-call-report": {
      // Dedup: if we've already persisted a vapi transcript for this
      // interview, the webhook was retried — acknowledge and exit before
      // double-inserting or double-triggering the analyzer.
      const { data: existing } = await admin
        .from("transcripts")
        .select("id")
        .eq("interview_id", interview.id)
        .eq("source", "vapi")
        .limit(1)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, deduplicated: true });
      }

      const endedAt = new Date();
      const durationSec = call?.startedAt
        ? Math.max(0, Math.round((endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000))
        : null;

      // Only stamp ended_at / duration / status the first time — first value
      // wins. `.neq("status", "completed")` short-circuits if a prior retry
      // already flipped it.
      await admin.from("interviews").update({
        status: "completed",
        ended_at: endedAt.toISOString(),
        duration_sec: durationSec,
      }).eq("id", interview.id).neq("status", "completed");

      const transcript = payload.message?.transcript ?? payload.transcript ?? call?.transcript;
      const segments = payload.message?.messages ?? call?.messages ?? null;
      if (transcript || segments) {
        const { error: tsErr } = await admin.from("transcripts").insert({
          interview_id: interview.id,
          source: "vapi",
          raw_text: typeof transcript === "string" ? transcript : null,
          segments: segments ?? null,
        });
        if (tsErr) {
          console.error("[vapi-webhook] transcript insert failed", { interview_id: interview.id, err: tsErr.message });
          return NextResponse.json({ error: tsErr.message }, { status: 500 });
        }

        // Fire-and-forget post-call analysis via a fresh serverless
        // invocation so we can return the webhook response in <1s.
        // Errors are logged — a missing summary should be investigable
        // without tailing Vapi's retry log.
        fetch(`${env().APP_URL}/api/analysis/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interview_id: interview.id }),
        }).catch((err) => {
          console.error("[vapi-webhook] analyzer dispatch failed", {
            interview_id: interview.id,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

type VapiCall = {
  id?: string;
  status?: string;
  startedAt?: string;
  transcript?: string;
  messages?: unknown;
};

type VapiEvent = {
  type?: string;
  transcript?: string;
  call?: VapiCall;
  message?: {
    type?: string;
    transcript?: string;
    messages?: unknown;
    call?: VapiCall;
  };
};
