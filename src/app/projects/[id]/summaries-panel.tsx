import Link from "next/link";

type Insight = { headline?: string; detail?: string; confidence?: string };
type Quote = { speaker?: string; text?: string; timestamp_ms?: number; why_notable?: string };

type Summary = {
  id: string;
  interview_id: string;
  insights: Insight[] | null;
  quotes: Quote[] | null;
  sentiment: { overall?: string; notes?: string; flags?: string[] } | null;
  created_at: string;
};

type InterviewSlim = {
  id: string;
  expert_name: string;
  expert_role: string | null;
};

export function SummariesPanel({
  summaries,
  interviews,
}: {
  summaries: Summary[];
  interviews: InterviewSlim[];
}) {
  const byId = new Map(interviews.map((i) => [i.id, i]));

  if (summaries.length === 0) {
    return (
      <section className="mt-12">
        <h2 className="text-sm font-medium text-neutral-400">Interview summaries</h2>
        <p className="mt-3 rounded-md border border-neutral-800 px-4 py-6 text-sm text-neutral-500">
          Post-call summaries will appear here once an interview ends and the Vapi webhook fires.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium text-neutral-400">Interview summaries</h2>
      <div className="mt-3 space-y-4">
        {summaries.map((s) => {
          const iv = byId.get(s.interview_id);
          const insights = s.insights ?? [];
          const quotes = s.quotes ?? [];
          return (
            <details key={s.id} className="rounded-md border border-neutral-800 p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{iv?.expert_name ?? "Expert"}</div>
                    <div className="text-xs text-neutral-500">{iv?.expert_role ?? ""}</div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {insights.length} insight{insights.length === 1 ? "" : "s"} ·{" "}
                    {quotes.length} quote{quotes.length === 1 ? "" : "s"}
                    {s.sentiment?.overall && ` · ${s.sentiment.overall}`}
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-4 text-sm">
                {insights.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Top insights</h3>
                    <ol className="mt-2 ml-5 list-decimal space-y-2">
                      {insights.map((ins, i) => (
                        <li key={i}>
                          <div className="font-medium">{ins.headline}</div>
                          {ins.detail && <div className="text-neutral-400">{ins.detail}</div>}
                          {ins.confidence && (
                            <div className="mt-0.5 text-xs text-neutral-500">confidence: {ins.confidence}</div>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {quotes.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Notable quotes</h3>
                    <ul className="mt-2 space-y-3">
                      {quotes.map((q, i) => (
                        <li key={i} className="border-l-2 border-neutral-700 pl-3">
                          <div className="text-neutral-200">&ldquo;{q.text}&rdquo;</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {q.speaker ?? "speaker"}
                            {q.timestamp_ms ? ` · ${Math.round((q.timestamp_ms ?? 0) / 1000)}s` : ""}
                            {q.why_notable && ` — ${q.why_notable}`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.sentiment && (s.sentiment.notes || (s.sentiment.flags?.length ?? 0) > 0) && (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Sentiment</h3>
                    {s.sentiment.notes && <p className="mt-1 text-neutral-300">{s.sentiment.notes}</p>}
                    {s.sentiment.flags && s.sentiment.flags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.sentiment.flags.map((f, i) => (
                          <span key={i} className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

// Not used currently but keeps the Link import handy for a future
// "Open transcript" action without having to re-import on every edit.
void Link;
