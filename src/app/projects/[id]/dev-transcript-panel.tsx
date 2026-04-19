"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE = `Interviewer: Thanks for making time today. To start, can you tell me about your role?
Expert: Sure. I run culinary operations for a 140-unit regional burger chain based in the Southeast. I oversee menu R&D, LTO planning, and our protein sourcing.
Interviewer: Got it. Let's talk about back-of-house labor. How has that shaped your LTO planning this year?
Expert: Massively. We've pulled back on anything that requires more than two extra prep steps. Our last three LTOs have all been "add one SKU, reuse two existing." The breakfast sandwich we did in March used the same egg patty, the same cheese, and just swapped in a chipotle aioli. That was intentional.
Interviewer: How did that one perform?
Expert: Mix hit 6.2% in the first four weeks, which for us is a win. Anything above 4 we green-light for a broader rollout.
Interviewer: What's one thing you'd change about how distributors are pitching you right now?
Expert: Honestly, stop showing up with a deck. I get 40 decks a quarter. Show me a sample, show me the case pricing locked for 12 months, and tell me which of my competitors is already running it.`;

export function DevTranscriptPanel({
  projectId,
  guideId,
}: {
  projectId: string;
  guideId: string | null;
}) {
  const router = useRouter();
  const [expertName, setExpertName] = useState("Sample Expert");
  const [expertRole, setExpertRole] = useState("Director of Culinary");
  const [segment, setSegment] = useState("operator");
  const [transcript, setTranscript] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dev/test-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          guide_id: guideId ?? undefined,
          expert_name: expertName,
          expert_role: expertRole || undefined,
          expert_segment: segment || undefined,
          transcript_text: transcript,
        }),
      });
      const j = await res.json();
      if (!res.ok && !j.interview) {
        throw new Error(typeof j.error === "string" ? j.error : "failed");
      }
      if (j.warning) {
        setMessage({ kind: "warn", text: `Interview saved, but analyzer warning: ${j.warning}` });
      } else {
        setMessage({ kind: "ok", text: "Interview + summary created. Refresh to see them below." });
      }
      router.refresh();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <details className="rounded-md border border-dashed border-amber-900/60 bg-amber-950/10 p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-amber-200">
          Dev tools — paste a test transcript
          <span className="ml-2 text-xs font-normal text-amber-400/70">
            bypasses Vapi so you can exercise the summary + themes UI
          </span>
        </summary>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              required
              className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
              placeholder="Expert name"
              value={expertName}
              onChange={(e) => setExpertName(e.target.value)}
            />
            <input
              className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
              placeholder="Role (optional)"
              value={expertRole}
              onChange={(e) => setExpertRole(e.target.value)}
            />
            <select
              className="rounded bg-neutral-900 px-3 py-2 text-sm outline-none focus:bg-neutral-800"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
            >
              <option value="">Segment (optional)</option>
              <option value="operator">Operator</option>
              <option value="distributor">Distributor</option>
              <option value="broker">Broker</option>
              <option value="chef">Chef</option>
              <option value="procurement">Procurement</option>
              <option value="category_manager">Category manager</option>
            </select>
          </div>

          <textarea
            required
            className="min-h-[220px] w-full rounded bg-neutral-900 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:bg-neutral-800"
            placeholder="Paste a transcript — plain text, ideally with 'Interviewer:' / 'Expert:' turns."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />

          {message && (
            <p
              className={
                message.kind === "ok"
                  ? "text-sm text-emerald-300"
                  : message.kind === "warn"
                  ? "text-sm text-amber-300"
                  : "text-sm text-red-400"
              }
            >
              {message.text}
            </p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setTranscript(SAMPLE)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Reset to sample
            </button>
            <button
              type="submit"
              disabled={busy || !expertName.trim() || transcript.trim().length < 40}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "Analyzing..." : "Create test interview + analyze"}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
