import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Palate</p>
      <h1 className="mt-4 text-5xl font-semibold leading-tight">
        Autonomous foodservice expert interviews.
      </h1>
      <p className="mt-6 text-lg text-neutral-300">
        Upload briefs, decks, and pricing sheets. Palate generates a tailored
        interview guide, runs an adaptive 30-minute voice call with a B2B
        foodservice expert, and returns a transcript, key quotes, and insight
        summary you can synthesize across 20+ calls.
      </p>
      <div className="mt-10 flex gap-3">
        {user ? (
          <>
            <Link
              href="/projects"
              className="rounded-md bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              View projects
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 hover:border-neutral-500"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
