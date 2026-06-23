// Builds the initial demo dataset for mock mode.
//
// Project A ("Premium Chicken LTO") is fully populated — materials, guide,
// three completed interviews with transcripts, per-call summaries, and
// synthesized themes — so the dashboard looks real the moment a teammate
// opens it. Project B is an empty starter so they can walk the whole flow
// (upload → guide → interview → themes) from scratch.
//
// Everything is derived through the same mock-LLM helpers the live flows use,
// so the seed and the interactive paths produce consistent-looking output.

import { randomUUID } from "node:crypto";
import { DEMO_USER } from "./config";
import {
  mockGuideFor,
  mockSummaryFor,
  mockThemesFor,
  MOCK_MODEL,
  type GuideJson,
  type PackedSummary,
} from "./llm";
import { SEED_INTERVIEWS } from "../../../fixtures/transcripts";
import type { MockStore, Row, TableName } from "./store";

// Fixed UUIDs so deep links stay stable across restarts.
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const GUIDE_A = "33333333-3333-4333-8333-333333333333";
const INTERVIEW_IDS = [
  "a1111111-1111-4111-8111-111111111111",
  "a2222222-2222-4222-8222-222222222222",
  "a3333333-3333-4333-8333-333333333333",
];

const BRIEF = `Research brief — Premium chicken LTO strategy for regional burger chains.
Client wants to understand how 20–200 unit burger operators evaluate a premium
chicken limited-time-offer (LTO): the path from concept to launch, where
concepts die, what suppliers must prove (samples, 12-month price locks,
competitive de-risking), and how back-of-house labor and equipment constraints
gate adoption. Key tension: chicken reuses the fryer protocol while beef LTOs
force grill recalibration. Segments to cover: directors of culinary, broadline
distributor category managers, and franchisee-council operators.`;

const PRICING_NOTE = `Pricing & ops note. Distributor case costs modeled at 28%
target food cost. Operators renegotiate distributor contracts every 12 months,
so supplier price locks beyond 12 months create a downstream commitment gap.
Labor model assumes no more than two prep steps and no new prep station per LTO.`;

export function buildSeed(store: MockStore): void {
  const now = Date.now();
  // Spread created_at backwards so "most recent first" ordering is meaningful.
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

  const add = (table: TableName, row: Omit<Row, "id"> & { id?: string }): Row => {
    store.seq += 1;
    const full: Row = { id: row.id ?? randomUUID(), ...row, __seq: store.seq } as Row;
    store.tables[table].push(full);
    return full;
  };

  // --- Project A: fully populated -----------------------------------------
  add("projects", {
    id: PROJECT_A,
    owner_id: DEMO_USER.id,
    name: "Premium Chicken LTO — Regional Burger Chains",
    topic: "How operators evaluate a premium chicken LTO",
    client: "Demo Client Co.",
    status: "active",
    voice_id: null,
    voice_name: null,
    created_at: at(600),
    updated_at: at(30),
  });

  const materials = [
    { filename: "research-brief.txt", text: BRIEF },
    { filename: "pricing-ops-note.txt", text: PRICING_NOTE },
  ].map((m, i) =>
    add("materials", {
      project_id: PROJECT_A,
      storage_path: `seed/${PROJECT_A}/${m.filename}`,
      filename: m.filename,
      mime_type: "text/plain",
      size_bytes: m.text.length,
      parse_status: "parsed",
      parse_error: null,
      extracted_text: m.text,
      created_at: at(590 - i),
    }),
  );

  const guideJson: GuideJson = mockGuideFor(
    { name: "Premium Chicken LTO", topic: "How operators evaluate a premium chicken LTO" },
    materials.map((m) => ({
      filename: m.filename as string,
      extracted_text: m.extracted_text as string,
    })),
  );
  add("interview_guides", {
    id: GUIDE_A,
    project_id: PROJECT_A,
    version: 1,
    objective: guideJson.objective,
    persona_target: guideJson.persona_target,
    guide_json: guideJson,
    model: MOCK_MODEL,
    created_at: at(560),
  });

  // Three completed interviews from the canned transcripts, each with a
  // transcript row and a derived summary.
  const packed: PackedSummary[] = [];
  SEED_INTERVIEWS.forEach((fx, i) => {
    const interviewId = INTERVIEW_IDS[i];
    const endedAt = at(500 - i * 40);
    const startedAt = new Date(new Date(endedAt).getTime() - fx.duration_sec * 1000).toISOString();

    add("interviews", {
      id: interviewId,
      project_id: PROJECT_A,
      guide_id: GUIDE_A,
      expert_name: fx.expert_name,
      expert_role: fx.expert_role,
      expert_segment: fx.expert_segment,
      status: "completed",
      scheduled_at: startedAt,
      started_at: startedAt,
      ended_at: endedAt,
      duration_sec: fx.duration_sec,
      vapi_call_id: `mock-call-${i + 1}`,
      created_at: at(540 - i * 40),
    });

    add("transcripts", {
      interview_id: interviewId,
      source: "manual",
      language: "en",
      raw_text: fx.transcript,
      segments: null,
      created_at: endedAt,
    });

    const summary = mockSummaryFor(fx.transcript, {
      expertSegment: fx.expert_segment,
      guideObjective: guideJson.objective,
    });
    add("summaries", {
      interview_id: interviewId,
      project_id: PROJECT_A,
      insights: summary.insights,
      quotes: summary.quotes,
      sentiment: summary.sentiment,
      follow_up_flags: summary.follow_up_flags,
      model: MOCK_MODEL,
      created_at: at(495 - i * 40),
    });
    packed.push({ interview_id: interviewId, quotes: summary.quotes });
  });

  // Cross-interview themes.
  mockThemesFor(packed).forEach((t, i) =>
    add("themes", {
      project_id: PROJECT_A,
      title: t.title,
      description: t.description,
      supporting_quotes: t.supporting_quotes,
      confidence: t.confidence,
      model: MOCK_MODEL,
      created_at: at(300 - i),
    }),
  );

  // --- Project B: empty starter -------------------------------------------
  add("projects", {
    id: PROJECT_B,
    owner_id: DEMO_USER.id,
    name: "Cold-Chain Packaging Study (start here)",
    topic: "Operator reactions to new cold-chain packaging",
    client: "Demo Client Co.",
    status: "active",
    voice_id: null,
    voice_name: null,
    // Older than Project A so the fully-populated project lists first.
    created_at: at(900),
    updated_at: at(900),
  });
}
