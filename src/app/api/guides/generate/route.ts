import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "@/lib/anthropic";
import { GUIDE_GENERATOR_SYSTEM, buildGuideUserPrompt } from "@/lib/prompts/guide-generator";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ project_id: z.string().uuid() });

// Concatenates the project's extracted material text (capped) and asks Claude
// to emit a structured guide. Streams under the hood via .stream().finalMessage()
// to avoid request-timeout issues on long generations.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: project } = await sb
    .from("projects")
    .select("id, name, topic")
    .eq("id", parsed.data.project_id)
    .single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const { data: materials } = await sb
    .from("materials")
    .select("filename, extracted_text")
    .eq("project_id", project.id)
    .eq("parse_status", "parsed");

  const excerpt = (materials ?? [])
    .map((m) => `### ${m.filename}\n${(m.extracted_text ?? "").slice(0, 40_000)}`)
    .join("\n\n")
    .slice(0, 180_000);

  if (!excerpt.trim()) {
    return NextResponse.json(
      { error: "No parsed materials yet. Upload and parse at least one file." },
      { status: 400 },
    );
  }

  const model = defaultModel();
  const stream = anthropic().messages.stream({
    model,
    max_tokens: 8_000,
    system: [
      { type: "text", text: GUIDE_GENERATOR_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: buildGuideUserPrompt({
          projectName: project.name,
          topic: project.topic,
          materialsExcerpt: excerpt,
        }),
      },
    ],
    ...BASE_REQUEST,
  });

  const final = await stream.finalMessage();
  const text = final.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let guideJson: unknown;
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    guideJson = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return NextResponse.json(
      { error: "Guide response was not valid JSON", raw: text.slice(0, 4000) },
      { status: 502 },
    );
  }

  const g = guideJson as { objective?: string; persona_target?: string };
  const { data: saved, error } = await sb
    .from("interview_guides")
    .insert({
      project_id: project.id,
      objective: g.objective ?? null,
      persona_target: g.persona_target ?? null,
      guide_json: guideJson as object,
      model,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ guide: saved });
}
