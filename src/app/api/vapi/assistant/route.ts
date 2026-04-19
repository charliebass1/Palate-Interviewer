import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  buildAssistantConfig,
  createAssistant,
  updateAssistant,
} from "@/lib/vapi";

export const runtime = "nodejs";

const Body = z.object({
  project_id: z.string().uuid().optional(),
  name: z.string().optional(),
  elevenlabs_voice_id: z.string().optional(),
});

// Creates (or updates, if VAPI_ASSISTANT_ID already set) the Palate assistant.
// If a project_id is supplied, attaches that project's latest guide as
// system-prompt context.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let guideJson: object | null = null;
  if (parsed.data.project_id) {
    const { data: guide } = await sb
      .from("interview_guides")
      .select("guide_json")
      .eq("project_id", parsed.data.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    guideJson = (guide?.guide_json as object | undefined) ?? null;
  }

  const cfg = buildAssistantConfig({
    name: parsed.data.name,
    guideJson,
    model: env().ANTHROPIC_MODEL,
    elevenLabsVoiceId: parsed.data.elevenlabs_voice_id,
    appUrl: env().APP_URL,
    webhookSecret: env().VAPI_WEBHOOK_SECRET,
  });

  try {
    const existing = env().VAPI_ASSISTANT_ID;
    const result = existing
      ? await updateAssistant(existing, cfg)
      : await createAssistant(cfg);
    return NextResponse.json({ assistant_id: result.id, updated: Boolean(existing) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
