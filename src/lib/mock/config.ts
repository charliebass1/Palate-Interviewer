// Central mock-mode detection.
//
// Mock mode lets the entire app run with ZERO external credentials. It swaps
// in an in-memory Supabase, deterministic mock LLM output, and a simulated
// call lifecycle so a teammate can `npm run dev` and click through the whole
// flow immediately — no Supabase / Anthropic / Vapi accounts required.
//
// It turns on automatically whenever Supabase isn't configured, and can be
// forced on/off with PALATE_MOCK_MODE=true|false. Once you wire real services
// into .env, the app flips to the live path with no code changes.

export function hasSupabaseCreds(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}

export function isMockMode(): boolean {
  const forced = process.env.PALATE_MOCK_MODE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  // Auto: mock whenever the real backend isn't configured.
  return !hasSupabaseCreds();
}

// The single demo user every mock request is authenticated as. Real auth is
// bypassed in mock mode; this id owns all seeded + created data.
export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@palate.dev",
};
