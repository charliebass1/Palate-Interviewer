import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { listVoices } from "@/lib/elevenlabs";

export const runtime = "nodejs";

// Lists the ElevenLabs voices available to the configured API key. Returns
// { configured: false } when no key is set so the UI can render a helpful
// "add ELEVENLABS_API_KEY to your env" hint.
export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    const result = await listVoices();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
