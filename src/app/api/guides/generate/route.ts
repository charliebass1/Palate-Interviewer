import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { generateGuide } from "@/lib/generate-guide";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ project_id: z.string().uuid() });

// Concatenates the project's extracted material text (capped) and asks Claude
// to emit a structured guide. Delegates to lib/generate-guide.ts so the smoke
// script can reuse the same path.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // RLS ownership check (admin client inside generateGuide bypasses RLS).
  const { data: project } = await sb
    .from("projects").select("id").eq("id", parsed.data.project_id).single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const result = await generateGuide(parsed.data.project_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: result.status },
    );
  }

  const { data: guide } = await sb
    .from("interview_guides")
    .select("id, version, objective, guide_json, created_at")
    .eq("id", result.guideId)
    .single();
  return NextResponse.json({ guide });
}
