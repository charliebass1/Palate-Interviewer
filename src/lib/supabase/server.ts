import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { isMockMode } from "../mock/config";
import { mockSupabaseClient } from "../mock/supabase";

type CookieChunk = { name: string; value: string; options?: CookieOptions };

// Per-request server client that forwards the user's auth cookies (RLS on).
export async function supabaseServer(): Promise<SupabaseClient> {
  if (isMockMode()) return mockSupabaseClient() as unknown as SupabaseClient;
  const store = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list: CookieChunk[]) {
        for (const { name, value, options } of list) {
          store.set({ name, value, ...options });
        }
      },
    },
  });
}

// Secret-key client for trusted server-side jobs (ingestion, webhook
// handlers, background analyzers). Bypasses RLS — use with care.
export function supabaseAdmin(): SupabaseClient {
  if (isMockMode()) return mockSupabaseClient() as unknown as SupabaseClient;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
