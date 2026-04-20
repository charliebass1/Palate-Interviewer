import { supabaseAdmin } from "./supabase/server";
import { anthropic, defaultModel, BASE_REQUEST } from "./anthropic";
import {
  GUIDE_GENERATOR_SYSTEM,
  buildGuideUserPrompt,
} from "./prompts/guide-generator";

export type GenerateGuideResult =
  | { ok: true; guideId: string; guideJson: object }
  | { ok: false; status: number; error: string; raw?: string };

// Shared across /api/guides/generate and the smoke script. Uses the admin
// client — callers are responsible for any ownership check.
export async function generateGuide(projectId: string): Promise<GenerateGuideResult> {
  const admin = supabaseAdmin();

  const { data: project } = await admin
    .from("projects")
    .select("id, name, topic")
    .eq("id", projectId)
    .single();
  if (!project) return { ok: false, status: 404, error: "project not found" };

  const { data: materials } = await admin
    .from("materials")
    .select("filename, extracted_text")
    .eq("project_id", project.id)
    .eq("parse_status", "parsed");

  const excerpt = (materials ?? [])
    .map((m) => `### ${m.filename}\n${(m.extracted_text ?? "").slice(0, 40_000)}`)
    .join("\n\n")
    .slice(0, 180_000);

  if (!excerpt.trim()) {
    return {
      ok: false,
      status: 400,
      error: "No parsed materials yet. Upload and parse at least one file.",
    };
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
    return {
      ok: false,
      status: 502,
      error: "Guide response was not valid JSON",
      raw: text.slice(0, 4000),
    };
  }

  const g = guideJson as { objective?: string; persona_target?: string };
  const { data: saved, error } = await admin
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
  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, guideId: saved.id, guideJson: guideJson as object };
}
