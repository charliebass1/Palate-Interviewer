"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Guide = {
  id: string;
  version: number;
  objective: string | null;
  guide_json: unknown;
  created_at: string;
};

type GuideShape = {
  objective?: string;
  persona_target?: string;
  sections?: {
    title: string;
    minutes?: number;
    questions?: { text: string; probes?: string[]; why_it_matters?: string }[];
  }[];
};

export function GuidePanel({
  projectId,
  initialGuide,
  hasParsedMaterial,
}: {
  projectId: string;
  initialGuide: Guide | null;
  hasParsedMaterial: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guides/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "generation failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const guide = initialGuide?.guide_json as GuideShape | undefined;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-400">Interview guide</h2>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !hasParsedMaterial}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Generating..." : initialGuide ? "Regenerate" : "Generate"}
        </button>
      </div>
      {!hasParsedMaterial && (
        <p className="mt-2 text-xs text-neutral-500">
          Upload and parse a material first — the generator reads its extracted text.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-3 rounded-md border border-neutral-800 p-4 text-sm">
        {!guide && <p className="text-neutral-500">No guide yet. Upload materials, then generate.</p>}
        {guide?.objective && (
          <p className="text-neutral-300"><span className="text-neutral-500">Objective: </span>{guide.objective}</p>
        )}
        {guide?.persona_target && (
          <p className="mt-1 text-neutral-300"><span className="text-neutral-500">Target: </span>{guide.persona_target}</p>
        )}
        {guide?.sections?.map((s, i) => (
          <div key={i} className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{s.title}</h3>
              {s.minutes != null && <span className="text-xs text-neutral-500">{s.minutes} min</span>}
            </div>
            <ol className="mt-2 ml-5 list-decimal space-y-2 text-neutral-300">
              {s.questions?.map((q, j) => (
                <li key={j}>
                  <div>{q.text}</div>
                  {q.probes && q.probes.length > 0 && (
                    <ul className="mt-1 ml-4 list-disc text-neutral-500">
                      {q.probes.map((p, k) => <li key={k}>{p}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
