import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const Create = z.object({
  project_id: z.string().uuid(),
  guide_id: z.string().uuid().optional(),
  expert_name: z.string().min(1).max(200),
  expert_role: z.string().max(200).optional(),
  expert_segment: z.string().max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("project_id");
  const q = sb.from("interviews")
    .select("id, expert_name, expert_role, expert_segment, status, scheduled_at, started_at, ended_at, duration_sec")
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

  const { data, error } = await sb
    .from("interviews")
    .insert({ ...parsed.data, status: "scheduled" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TODO: call Vapi to create an outbound call or assistant session here,
  // then patch `vapi_call_id` onto the row. Left as a stub so the rest of
  // the pipeline (webhook → transcript → summary) can be exercised with a
  // manually-initiated Vapi call referencing this interview.id.

  return NextResponse.json({ interview: data }, { status: 201 });
}
