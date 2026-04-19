import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import pdfParse from "pdf-parse";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({ material_id: z.string().uuid() });

// Downloads the uploaded file, extracts text, and writes it back onto the
// materials row. RAG chunking + embeddings will be added in a follow-up
// migration; for now the guide generator reads `extracted_text` directly.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ownership check via RLS-enforced user client.
  const { data: material, error } = await sb
    .from("materials")
    .select("id, project_id, storage_path, mime_type, filename")
    .eq("id", parsed.data.material_id)
    .single();
  if (error || !material) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await admin.from("materials")
    .update({ parse_status: "parsing", parse_error: null })
    .eq("id", material.id);

  try {
    const { data: file, error: dlErr } =
      await admin.storage.from("materials").download(material.storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "download failed");

    const buf = Buffer.from(await file.arrayBuffer());
    const isPdf = material.mime_type === "application/pdf"
      || material.filename.toLowerCase().endsWith(".pdf");
    const text = isPdf ? (await pdfParse(buf)).text : buf.toString("utf-8");

    await admin.from("materials").update({
      parse_status: "parsed",
      extracted_text: text.slice(0, 200_000),
    }).eq("id", material.id);

    return NextResponse.json({ ok: true, char_count: text.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("materials").update({
      parse_status: "failed",
      parse_error: message,
    }).eq("id", material.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
