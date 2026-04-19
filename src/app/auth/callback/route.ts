import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Magic-link landing handler. Supabase redirects here with ?code=...; we
// exchange it for a session (cookies set via the server client) and then
// bounce the user to ?next=... or /projects.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/projects";

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("Missing auth code")}`, url.origin),
    );
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
