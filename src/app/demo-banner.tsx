import Link from "next/link";

// Slim top bar shown only in mock mode, so the team always knows the data
// isn't real and where to look to wire up the live backend.
export function DemoBanner() {
  return (
    <div className="border-b border-amber-900/50 bg-amber-950/30 px-4 py-2 text-center text-xs text-amber-200">
      <span className="font-medium">Demo mode</span> — running on in-memory mock
      data. No Supabase / Anthropic / Vapi credentials required.{" "}
      <Link href="/debug" className="underline underline-offset-2 hover:text-amber-100">
        View status
      </Link>
    </div>
  );
}
