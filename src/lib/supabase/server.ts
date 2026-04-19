import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

// Per-request server client that forwards the user's auth cookies (RLS on).
export async function supabaseServer() {
  const store = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          store.set({ name, value, ...options });
        }
      },
    },
  });
}

// Service-role client for trusted server-side jobs (ingestion, webhook
// handlers, background analyzers). Bypasses RLS — use with care.
export function supabaseAdmin() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
