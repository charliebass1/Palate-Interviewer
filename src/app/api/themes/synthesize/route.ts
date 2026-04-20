import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { synthesizeThemes } from "@/lib/synthesize";

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

  // Ownership check before handing off to the admin-client synthesizer.
  const { data: project } = await sb
    .from("projects").select("id").eq("id", parsed.data.project_id).single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const result = await synthesizeThemes(parsed.data.project_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, raw: result.raw },
      { status: result.status },
    );
  }
  return NextResponse.json({ themes: result.themes });
}
