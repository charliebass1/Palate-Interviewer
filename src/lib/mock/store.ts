// In-memory store backing the mock Supabase client.
//
// Persisted on globalThis so it survives Next.js HMR and is shared across all
// server routes/components in a single running process. Mutations (new
// projects, uploads, simulated interviews) last for the life of that process
// and reset on restart — exactly what you want for a click-through prototype.
//
// Note: this assumes a single long-lived server (next dev / next start). On
// multi-instance serverless, mutations won't be shared across instances —
// fine for local demos, and the seed data always renders.

import { DEMO_USER } from "./config";
import { buildSeed } from "./seed";

export type Row = Record<string, unknown> & { id: string; created_at?: string };

export type TableName =
  | "projects"
  | "materials"
  | "interview_guides"
  | "interviews"
  | "transcripts"
  | "summaries"
  | "themes";

export type Tables = Record<TableName, Row[]>;

export type StorageBlob = { bytes: Buffer; contentType?: string };

export type MockStore = {
  tables: Tables;
  storage: Map<string, StorageBlob>;
  users: { id: string; email: string }[];
  seq: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __palateMockStore: MockStore | undefined;
}

export function getStore(): MockStore {
  if (!globalThis.__palateMockStore) {
    const store: MockStore = {
      tables: {
        projects: [],
        materials: [],
        interview_guides: [],
        interviews: [],
        transcripts: [],
        summaries: [],
        themes: [],
      },
      storage: new Map(),
      users: [{ ...DEMO_USER }],
      seq: 0,
    };
    globalThis.__palateMockStore = store;
    buildSeed(store);
  }
  return globalThis.__palateMockStore;
}

// Monotonic counter used as a stable tiebreaker when ordering rows that share
// a timestamp (e.g. several rows seeded in the same millisecond).
export function nextSeq(store: MockStore): number {
  store.seq += 1;
  return store.seq;
}
