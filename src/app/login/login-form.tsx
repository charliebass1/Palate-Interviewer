"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (next) redirectTo.searchParams.set("next", next);

      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo.toString() },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
        Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        autoFocus
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email}
        className="w-full rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}
