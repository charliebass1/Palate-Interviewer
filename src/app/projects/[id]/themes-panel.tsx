"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Theme = {
  id: string;
  title: string;
  description: string | null;
  supporting_quotes: { interview_id?: string; speaker?: string; quote?: string }[] | null;
  confidence: number | null;
  created_at: string;
};

export function ThemesPanel({
  projectId,
  initial,
  canSynthesize,
}: {
  projectId: string;
  initial: Theme[];
  canSynthesize: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function synthesize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/themes/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "synthesis failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-400">Cross-interview themes</h2>
        <button
          type="button"
          onClick={synthesize}
          disabled={busy || !canSynthesize}
          title={canSynthesize ? "" : "Need at least one completed interview summary"}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Synthesizing..." : initial.length > 0 ? "Re-synthesize" : "Synthesize"}
        </button>
      </div>
      {!canSynthesize && (
        <p className="mt-2 text-xs text-neutral-500">
          Available once you have at least one completed interview summary.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {initial.length === 0 ? (
        <p className="mt-3 rounded-md border border-neutral-800 px-4 py-6 text-sm text-neutral-500">
          {canSynthesize
            ? "No themes yet. Click Synthesize to cluster insights across interviews."
            : "Themes appear once you've completed at least one interview. Works best across 3+."}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {initial.map((t) => (
            <div key={t.id} className="rounded-md border border-neutral-800 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{t.title}</h3>
                {t.confidence != null && (
                  <span className="text-xs text-neutral-500">
                    confidence {Math.round(t.confidence * 100)}%
                  </span>
                )}
              </div>
              {t.description && <p className="mt-2 text-sm text-neutral-300">{t.description}</p>}
              {t.supporting_quotes && t.supporting_quotes.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm">
                  {t.supporting_quotes.map((q, i) => (
                    <li key={i} className="border-l-2 border-neutral-700 pl-3 text-neutral-400">
                      &ldquo;{q.quote}&rdquo;
                      {q.speaker && <span className="ml-1 text-xs text-neutral-500"> — {q.speaker}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
