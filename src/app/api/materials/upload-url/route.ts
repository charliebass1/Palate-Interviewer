import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const Body = z.object({
  project_id: z.string().uuid(),
  filename: z.string().min(1).max(300),
  mime_type: z.string().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

// Returns a signed upload URL the browser can PUT the file to directly.
// Also inserts the material row up front so parsing can be kicked off once
// the upload completes.
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { project_id, filename, mime_type, size_bytes } = parsed.data;

  // RLS check: confirm the project belongs to the caller.
  const { data: project, error: projErr } = await sb
    .from("projects").select("id").eq("id", project_id).single();
  if (projErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const { data: material, error: insErr } = await sb
    .from("materials")
    .insert({
      project_id,
      filename,
      mime_type: mime_type ?? null,
      size_bytes: size_bytes ?? null,
      storage_path: "", // filled in below once we know the id
    })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const storagePath = `${project_id}/${material.id}/${filename}`;
  const { error: upErr } = await sb
    .from("materials")
    .update({ storage_path: storagePath })
    .eq("id", material.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed, error: sigErr } = await sb
    .storage.from("materials").createSignedUploadUrl(storagePath);
  if (sigErr) return NextResponse.json({ error: sigErr.message }, { status: 500 });

  return NextResponse.json({
    material_id: material.id,
    storage_path: storagePath,
    upload: signed,
  });
}
