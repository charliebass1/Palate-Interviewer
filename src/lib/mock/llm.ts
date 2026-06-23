// Deterministic stand-ins for the three Claude calls + the Vapi transcript.
//
// These are NOT random fixtures: each function reads the same inputs the real
// Claude path reads (materials, transcript, summaries) and derives output from
// them, so data genuinely streams source → guide → call → transcript →
// summary → themes. That makes the prototype feel real — the guide references
// your topic, the summary quotes your transcript, the themes cite your calls.

export const MOCK_MODEL = "mock-demo-1";

// ---------------------------------------------------------------------------
// Guide generation (mock for lib/generate-guide.ts)
// ---------------------------------------------------------------------------

type GuideQuestion = { text: string; probes: string[]; why_it_matters: string };
type GuideSection = { title: string; minutes: number; questions: GuideQuestion[] };
export type GuideJson = {
  objective: string;
  persona_target: string;
  sections: GuideSection[];
};

export function mockGuideFor(
  project: { name: string; topic?: string | null },
  materials: { filename?: string; extracted_text?: string | null }[],
): GuideJson {
  const topic = (project.topic || project.name || "this category").trim();
  const corpus = materials
    .map((m) => m.extracted_text ?? "")
    .join(" ")
    .toLowerCase();
  const keywords = pickKeywords(corpus);
  const kw = (i: number, fallback: string) => keywords[i] ?? fallback;

  return {
    objective: `Understand how foodservice decision-makers evaluate ${topic}, what operational constraints gate adoption, and what suppliers must prove to win a slot.`,
    persona_target:
      "Director/VP of Culinary, category managers, and franchisee-council operators at regional chains (20–200 units).",
    sections: [
      {
        title: "Warm-up & role",
        minutes: 4,
        questions: [
          {
            text: "Walk me through your role and how decisions about new menu items or suppliers actually get made on your team.",
            probes: ["Who else is in the room?", "Where does the final yes/no happen?"],
            why_it_matters: "Establishes the decision unit and where to aim later questions.",
          },
        ],
      },
      {
        title: `Current state of ${topic}`,
        minutes: 8,
        questions: [
          {
            text: `How has ${kw(0, "labor and cost pressure")} reshaped the way you approach ${topic} over the last year?`,
            probes: ["Can you give a specific example?", "What changed in the numbers?"],
            why_it_matters: `Grounds the conversation in the operator's lived experience of ${topic}.`,
          },
          {
            text: `Where do most ${kw(1, "new concepts")} die before launch, and why?`,
            probes: ["At which stage exactly?", "Who pulls the plug?"],
            why_it_matters: "Surfaces the real gating constraints, not the stated ones.",
          },
        ],
      },
      {
        title: "Supplier evaluation",
        minutes: 8,
        questions: [
          {
            text: "What separates a supplier that wins a slot from one that doesn't?",
            probes: ["Sample vs. deck — which moves you?", "How important is locked pricing?"],
            why_it_matters: "Maps the buying criteria suppliers most often get wrong.",
          },
          {
            text: `What role does ${kw(2, "competitive intel")} play when you're deciding whether to pilot something?`,
            probes: ["Does a competitor running it help or hurt?", "Does scale-match matter?"],
            why_it_matters: "Tests the de-risking-signal thesis directly.",
          },
        ],
      },
      {
        title: "Constraints & close",
        minutes: 5,
        questions: [
          {
            text: "What operational constraint do suppliers most underestimate?",
            probes: ["Back-of-house labor?", "Equipment or training load?"],
            why_it_matters: "Names the silent killer that decks never address.",
          },
          {
            text: "Who else should we be talking to, and what would they disagree with you about?",
            probes: ["Where would an operator push back?", "Who has the opposite view?"],
            why_it_matters: "Generates referrals and flags the axes of disagreement to probe next.",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Post-call analysis (mock for lib/analyze.ts)
// ---------------------------------------------------------------------------

type Insight = { headline: string; detail: string; confidence: "low" | "medium" | "high" };
type Quote = { speaker: string; text: string; timestamp_ms: number; why_notable: string };
export type SummaryJson = {
  insights: Insight[];
  quotes: Quote[];
  sentiment: { overall: string; notes: string; flags: string[] };
  follow_up_flags: { reason: string; suggested_question: string }[];
  themes_hint: string[];
};

export function mockSummaryFor(
  transcriptText: string,
  ctx: { expertSegment?: string | null; guideObjective?: string | null },
): SummaryJson {
  const turns = parseExpertTurns(transcriptText);
  const segment = ctx.expertSegment || "operator";

  // Quotes: prefer operationally specific turns (those with numbers), longest
  // first, capped at 5. Pulled verbatim from the transcript.
  const ranked = [...turns].sort((a, b) => score(b) - score(a));
  const quotes: Quote[] = ranked.slice(0, 5).map((t, i) => ({
    speaker: "Expert",
    text: clip(t, 260),
    timestamp_ms: (i + 1) * 180_000,
    why_notable: /\d/.test(t)
      ? "Operationally specific — cites a concrete number or detail."
      : "Vivid framing that captures the expert's mental model.",
  }));

  // Insights: derive headlines from the highest-signal turns.
  const insights: Insight[] = ranked.slice(0, 5).map((t) => {
    const [first, second] = splitSentences(t);
    return {
      headline: clip(first, 110),
      detail: clip(second || first, 200),
      confidence: /\d/.test(t) ? "high" : "medium",
    };
  });
  while (insights.length < 3) {
    insights.push({
      headline: `${cap(segment)} decisions hinge on operational fit, not taste alone.`,
      detail: "Repeatedly framed back-of-house labor and equipment as the real gate.",
      confidence: "medium",
    });
  }

  return {
    insights,
    quotes,
    sentiment: detectSentiment(transcriptText, segment),
    follow_up_flags: [
      {
        reason: "Pricing terms were directional, not pinned.",
        suggested_question: "What exact price-lock duration would let you commit downstream?",
      },
      {
        reason: `Wanted a ${segment}-specific scale comparison.`,
        suggested_question: "Which reference customer's scale most resembles yours?",
      },
    ],
    themes_hint: detectThemeHints(transcriptText),
  };
}

// ---------------------------------------------------------------------------
// Cross-interview synthesis (mock for lib/synthesize.ts)
// ---------------------------------------------------------------------------

export type PackedSummary = {
  interview_id: string;
  insights?: unknown;
  quotes?: unknown;
  sentiment?: unknown;
};
export type ThemeRow = {
  title: string;
  description: string | null;
  supporting_quotes: { interview_id: string; speaker: string; quote: string }[];
  confidence: number | null;
};

const THEME_TEMPLATES: { title: string; description: string; keywords: string[] }[] = [
  {
    title: "Samples beat decks, every time",
    description:
      "Across interviews, the fastest path to a pilot is a usable in-kitchen sample, not a pitch deck. Suppliers that lead with decks are systematically ignored.",
    keywords: ["sample", "deck", "kitchen", "pitch"],
  },
  {
    title: "Back-of-house labor is the silent filter",
    description:
      "Labor, equipment, and training load kill more concepts than taste ever does. Products that drop into an existing station with no new prep step clear the bar far more often.",
    keywords: ["labor", "prep", "equipment", "station", "training", "fryer", "shift"],
  },
  {
    title: "12-month price locks are becoming table stakes",
    description:
      "Operators can't launch on volatile COGS. A 12-month lock aligned to distributor contract renewals is the expected default; refusing to put price in writing is a deal-killer.",
    keywords: ["price", "lock", "12", "cogs", "pricing", "month"],
  },
  {
    title: "The 'competitor is running it' signal is contested",
    description:
      "Directors of culinary read a competitor pilot as de-risking; smaller-chain operators read it as a fit risk and want scale-matched proof instead. This is the sharpest axis of disagreement.",
    keywords: ["competitor", "whataburger", "de-risk", "scale", "intel", "competitive"],
  },
  {
    title: "Premium chicken drops into existing flow",
    description:
      "Chicken LTOs are easier to greenlight than beef because they reuse the fryer protocol; positioning premium chicken as a beef replacement, however, reads as the wrong menu architecture.",
    keywords: ["chicken", "fryer", "beef", "patty"],
  },
  {
    title: "The decision is a multi-stakeholder gauntlet",
    description:
      "Culinary, operations, the franchisee council, and marketing each hold a veto. Suppliers who only understand the culinary conversation get blindsided downstream.",
    keywords: ["council", "franchisee", "culinary", "operations", "marketing", "stakeholder"],
  },
];

export function mockThemesFor(packed: PackedSummary[]): ThemeRow[] {
  const themes: ThemeRow[] = [];

  for (const tpl of THEME_TEMPLATES) {
    const supporting: ThemeRow["supporting_quotes"] = [];
    const interviewsHit = new Set<string>();

    for (const s of packed) {
      const quotes = Array.isArray(s.quotes) ? (s.quotes as { text?: string; speaker?: string }[]) : [];
      for (const q of quotes) {
        const text = (q.text ?? "").toLowerCase();
        if (tpl.keywords.some((k) => text.includes(k))) {
          if (supporting.length < 3) {
            supporting.push({
              interview_id: s.interview_id,
              speaker: q.speaker ?? "Expert",
              quote: clip(q.text ?? "", 220),
            });
          }
          interviewsHit.add(s.interview_id);
          break;
        }
      }
    }

    if (supporting.length === 0) continue;
    const confidence = Math.min(0.95, 0.5 + 0.15 * interviewsHit.size);
    themes.push({
      title: tpl.title,
      description: tpl.description,
      supporting_quotes: supporting,
      confidence: Number(confidence.toFixed(2)),
    });
  }

  // Always return something useful even if keyword matching is sparse.
  if (themes.length === 0 && packed.length > 0) {
    themes.push({
      title: "Operational fit dominates the buying decision",
      description:
        "Every interview returned to the same core: taste opens the door, but labor, equipment, and pricing terms decide whether a product actually launches.",
      supporting_quotes: [],
      confidence: 0.6,
    });
  }

  return themes.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Transcript synthesis (mock for a Vapi call)
// ---------------------------------------------------------------------------

export function mockTranscriptFor(args: {
  expertName: string;
  expertRole?: string | null;
  expertSegment?: string | null;
  guideJson?: GuideJson | null;
}): string {
  const role = args.expertRole || "a foodservice operator";
  const segment = args.expertSegment || "operator";
  const q = args.guideJson?.sections?.flatMap((s) => s.questions ?? []) ?? [];
  const ask = (i: number, fallback: string) => q[i]?.text ?? fallback;

  return [
    `Interviewer: Thanks for making time today. To start, can you tell me about your role?`,
    `Expert: Sure. I'm ${args.expertName}, ${role}. I sit across menu R&D, supplier evaluation, and the operational side of launching anything new across our units.`,
    ``,
    `Interviewer: ${ask(1, "How has cost and labor pressure reshaped your approach this year?")}`,
    `Expert: Massively. We've pulled back on anything that needs more than two extra prep steps. Our last three launches were all "add one SKU, reuse two existing." I can model an LTO at 28% food cost in a day, but if it needs a third prep station it dies in review.`,
    ``,
    `Interviewer: ${ask(2, "What separates a supplier that wins a slot from one that doesn't?")}`,
    `Expert: Three things. One, show up with a sample, not a deck — I get 40 decks a quarter and look at maybe three. Two, lock pricing for 12 months so the financial model holds. Three, tell me which of my competitors already cleared it. That last one was rare 18 months ago; now about one in five suppliers does it.`,
    ``,
    `Interviewer: ${ask(3, "Does a competitor running it help or hurt?")}`,
    `Expert: For me it helps — if their procurement cleared it, it clears my bar. But I'll be honest, a 60-unit operator I talked to reads it the opposite way, like it won't fit their scale. So it cuts both ways depending on who you ask.`,
    ``,
    `Interviewer: What operational constraint do suppliers most underestimate?`,
    `Expert: Back-of-house labor, full stop. If it doesn't drop into an existing station with the same two-step prep, I can't run it — I don't care how good it tastes. The smart suppliers build the product specifically to fit the flow.`,
    ``,
    `Interviewer: Last one — who else should we talk to?`,
    `Expert: Talk to a franchisee council chair. They'll tell you corporate optimizes for the plate and franchisees optimize for the shift. That gap is where most ${segment} launches actually fall apart.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "they", "their", "from", "into",
  "your", "you", "our", "are", "was", "were", "has", "have", "had", "but", "not",
  "what", "when", "where", "which", "how", "who", "about", "more", "most", "than",
  "them", "then", "out", "get", "got", "can", "will", "would", "could", "one",
  "two", "three", "interviewer", "expert", "sure",
]);

function pickKeywords(corpus: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of corpus.split(/[^a-z]+/)) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

function parseExpertTurns(transcript: string): string[] {
  const turns: string[] = [];
  let current: string | null = null;
  for (const line of transcript.split("\n")) {
    const trimmed = line.trim();
    if (/^expert\s*:/i.test(trimmed)) {
      if (current) turns.push(current.trim());
      current = trimmed.replace(/^expert\s*:/i, "").trim();
    } else if (/^interviewer\s*:/i.test(trimmed)) {
      if (current) turns.push(current.trim());
      current = null;
    } else if (current != null && trimmed) {
      current += " " + trimmed;
    }
  }
  if (current) turns.push(current.trim());
  // Fallback: if there were no labels, treat paragraphs as turns.
  if (turns.length === 0) {
    return transcript
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40);
  }
  return turns.filter((t) => t.length > 0);
}

function score(turn: string): number {
  const digits = (turn.match(/\d/g) ?? []).length;
  return turn.length + digits * 25;
}

function splitSentences(text: string): [string, string] {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return [parts[0] ?? text, parts[1] ?? ""];
}

function detectSentiment(transcript: string, segment: string) {
  const t = transcript.toLowerCase();
  const flags: string[] = [];
  if (/(absolutely|cannot stress|full stop|every time)/.test(t)) flags.push("strong_conviction");
  if (/(but|however|disagree|opposite|contradic)/.test(t)) flags.push("contradiction");
  if (/(competitor|whataburger|competitive)/.test(t)) flags.push("competitive_sensitivity");
  const positives = (t.match(/\b(win|grow|works|yes|easier|persuasive)\b/g) ?? []).length;
  const negatives = (t.match(/\b(dead|dies|kill|nightmare|fail|destroy|no)\b/g) ?? []).length;
  const overall =
    positives > negatives + 2 ? "positive" : negatives > positives + 2 ? "negative" : "mixed";
  return {
    overall,
    notes: `Engaged and candid ${segment}; gave concrete operational detail and was willing to name where they disagree with peers.`,
    flags,
  };
}

function detectThemeHints(transcript: string): string[] {
  const t = transcript.toLowerCase();
  const hints: [RegExp, string][] = [
    [/sample|deck/, "sample-over-deck"],
    [/price|lock|cogs/, "12-month price lock"],
    [/labor|prep|station|equipment/, "back-of-house labor filter"],
    [/competitor|whataburger|competitive/, "competitive de-risking signal"],
    [/chicken|fryer|beef/, "chicken-vs-beef LTO"],
    [/council|franchisee/, "multi-stakeholder veto"],
  ];
  const out = hints.filter(([re]) => re.test(t)).map(([, tag]) => tag);
  return out.length ? out : ["operational-fit"];
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
