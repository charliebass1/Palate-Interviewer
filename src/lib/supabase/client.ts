"use client";

import { createBrowserClient } from "@supabase/ssr";

// Reads either the new (publishable) or legacy (anon) public key —
// Next.js inlines both at build time, so the fallback is safe.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
