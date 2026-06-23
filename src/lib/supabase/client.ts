"use client";

import { createBrowserClient } from "@supabase/ssr";

// Reads either the new (publishable) or legacy (anon) public key —
// Next.js inlines both at build time, so the fallback is safe.
export function supabaseBrowser() {
  // Mock mode: no Supabase URL is inlined, so auth is bypassed server-side and
  // /login is never reached. This stub keeps the form from constructing a
  // broken client if someone navigates straight to it.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      auth: {
        async signInWithOtp() {
          return { data: {}, error: null };
        },
      },
    } as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
