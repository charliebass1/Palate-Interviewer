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
    .select("id, project_id")
    .eq("vapi_call_id", callId)
    .single();
  if (!interview) return NextResponse.json({ ok: true, no_match: true });

  switch (event) {
    case "call.started":
    case "call-started":
    case "status-update": {
      if (call?.status === "in-progress" || event !== "status-update") {
        await admin.from("interviews")
          .update({ status: "in_progress", started_at: new Date().toISOString() })
          .eq("id", interview.id);
      }
      break;
    }

    case "call.ended":
    case "call-ended":
    case "end-of-call-report": {
      const endedAt = new Date();
      const durationSec = call?.startedAt
        ? Math.max(0, Math.round((endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000))
        : null;

      await admin.from("interviews").update({
        status: "completed",
        ended_at: endedAt.toISOString(),
        duration_sec: durationSec,
      }).eq("id", interview.id);

      const transcript = payload.message?.transcript ?? payload.transcript ?? call?.transcript;
      const segments = payload.message?.messages ?? call?.messages ?? null;
      if (transcript || segments) {
        await admin.from("transcripts").insert({
          interview_id: interview.id,
          source: "vapi",
          raw_text: typeof transcript === "string" ? transcript : null,
          segments: segments ?? null,
        });

        // Fire-and-forget post-call analysis.
        fetch(`${env().APP_URL}/api/analysis/summarize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interview_id: interview.id }),
        }).catch(() => {});
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

type VapiEvent = {
  type?: string;
  transcript?: string;
  call?: {
    id?: string;
    status?: string;
    startedAt?: string;
    transcript?: string;
    messages?: unknown;
  };
  message?: {
    type?: string;
    transcript?: string;
    messages?: unknown;
    call?: { id?: string; status?: string; startedAt?: string };
  };
};
