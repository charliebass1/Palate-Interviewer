import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { createOutboundCall } from "@/lib/vapi";

const Create = z.object({
  project_id: z.string().uuid(),
  guide_id: z.string().uuid().optional(),
  expert_name: z.string().min(1).max(200),
  expert_role: z.string().max(200).optional(),
  expert_segment: z.string().max(100).optional(),
  expert_phone: z.string().min(6).max(32).optional(), // E.164
  scheduled_at: z.string().datetime().optional(),
  dial_now: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("project_id");
  const q = sb.from("interviews")
    .select("id, expert_name, expert_role, expert_segment, status, scheduled_at, started_at, ended_at, duration_sec, vapi_call_id")
    .order("scheduled_at", { ascending: false });
  if (projectId) q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interviews: data });
}

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Create.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { expert_phone, dial_now, ...persistable } = parsed.data;

  const { data: interview, error } = await sb
    .from("interviews")
    .insert({ ...persistable, status: "scheduled" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (dial_now && expert_phone) {
    const { VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID } = env();
    if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
      return NextResponse.json(
        {
          interview,
          warning: "VAPI_API_KEY / VAPI_ASSISTANT_ID / VAPI_PHONE_NUMBER_ID not configured — interview row saved but no call was dialed.",
        },
        { status: 201 },
      );
    }

    try {
      const call = await createOutboundCall({
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customerNumber: expert_phone,
        customerName: interview.expert_name ?? undefined,
        metadata: { interview_id: interview.id, project_id: interview.project_id },
      });
      await sb.from("interviews")
        .update({ vapi_call_id: call.id, status: "in_progress" })
        .eq("id", interview.id);
      return NextResponse.json({ interview: { ...interview, vapi_call_id: call.id } }, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        {
          interview,
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ interview }, { status: 201 });
}
