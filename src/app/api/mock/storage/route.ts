import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/mock/config";
import { getStore } from "@/lib/mock/store";

export const runtime = "nodejs";

// Stand-in for a Supabase signed-upload URL. The materials panel PUTs the file
// here in mock mode; we stash the bytes so the parse route can "download" and
// extract them just like the real storage flow.
export async function PUT(req: NextRequest) {
  if (!isMockMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const bytes = Buffer.from(await req.arrayBuffer());
  getStore().storage.set(path, {
    bytes,
    contentType: req.headers.get("content-type") ?? undefined,
  });

  return NextResponse.json({ ok: true, size: bytes.length });
}
