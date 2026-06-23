import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/mock/config";

type CookieChunk = { name: string; value: string; options?: CookieOptions };

// Refreshes Supabase auth cookies on every request so server components can
// rely on a live session. Called from src/middleware.ts.
export async function updateSession(request: NextRequest) {
  // Mock mode has no real session to refresh — skip straight through.
  if (isMockMode()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list: CookieChunk[]) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() forces the client to refresh the session if needed.
  await supabase.auth.getUser();

  return response;
}
