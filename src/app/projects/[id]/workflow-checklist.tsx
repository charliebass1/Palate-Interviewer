type Step = {
  n: number;
  title: string;
  hint: string;
  done: boolean;
};

// Four-stage visual progress bar that sits above the panel grid on the
// project detail page. Each step's "done" state is computed from the data
// already fetched in page.tsx — no extra queries.
export function WorkflowChecklist({
  hasParsedMaterial,
  hasGuide,
  hasCompletedInterview,
  hasThemes,
}: {
  hasParsedMaterial: boolean;
  hasGuide: boolean;
  hasCompletedInterview: boolean;
  hasThemes: boolean;
}) {
  const steps: Step[] = [
    {
      n: 1,
      title: "Upload materials",
      hint: "Upload a PDF or TXT brief.",
      done: hasParsedMaterial,
    },
    {
      n: 2,
      title: "Generate guide",
      hint: "Claude drafts a 30-min interview guide.",
      done: hasGuide,
    },
    {
      n: 3,
      title: "Run an interview",
      hint: "Schedule and dial, or paste a test transcript.",
      done: hasCompletedInterview,
    },
    {
      n: 4,
      title: "Synthesize themes",
      hint: "Cluster insights across calls.",
      done: hasThemes,
    },
  ];

  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <section className="mt-8 rounded-md border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-widest text-neutral-500">
        Workflow
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-4">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx;
          const tone = s.done
            ? "border-emerald-900/60 bg-emerald-950/20 text-emerald-200"
            : isCurrent
            ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/10 text-neutral-100"
            : "border-neutral-800 text-neutral-500";
          return (
            <li key={s.n} className={`rounded-md border px-3 py-2 ${tone}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                    s.done
                      ? "bg-emerald-500 text-black"
                      : isCurrent
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {s.done ? "✓" : s.n}
                </span>
                <span className="text-sm font-medium">{s.title}</span>
              </div>
              <p className="mt-1 text-xs opacity-80">{s.hint}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
