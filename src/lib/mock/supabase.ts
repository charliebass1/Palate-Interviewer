// A small in-memory stand-in for the Supabase JS client, implementing exactly
// the subset of the query-builder / auth / storage API this app uses. Because
// it mirrors the real client's shape, every route and page keeps calling
// `sb.from(...).select()...` unchanged — only the client factory swaps.

import { randomUUID } from "node:crypto";
import { DEMO_USER } from "./config";
import { getStore, type MockStore, type Row, type TableName } from "./store";

type Result = { data: unknown; error: { message: string } | null; count?: number };
type Filter = { type: "eq" | "neq" | "is" | "like"; col: string; val: unknown };

// Per-table defaults applied on insert, mirroring the SQL schema defaults so
// rows look the same whether they came from a full insert or a partial one.
const DEFAULTS: Record<TableName, () => Record<string, unknown>> = {
  projects: () => ({ status: "active", topic: null, client: null, voice_id: null, voice_name: null, updated_at: new Date().toISOString() }),
  materials: () => ({ parse_status: "pending", parse_error: null, extracted_text: null, mime_type: null, size_bytes: null }),
  interview_guides: () => ({ version: 1, objective: null, persona_target: null, model: null }),
  interviews: () => ({ status: "scheduled", guide_id: null, expert_role: null, expert_segment: null, scheduled_at: null, vapi_call_id: null, started_at: null, ended_at: null, duration_sec: null }),
  transcripts: () => ({ source: "manual", language: "en", raw_text: null, segments: null }),
  summaries: () => ({ sentiment: null, follow_up_flags: [], model: null }),
  themes: () => ({ description: null, supporting_quotes: [], confidence: null, model: null }),
};

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = (row as Record<string, unknown>)[f.col];
    switch (f.type) {
      case "eq":
      case "is":
        return v === f.val;
      case "neq":
        return v !== f.val;
      case "like": {
        const pattern = String(f.val)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/%/g, ".*");
        return typeof v === "string" && new RegExp(`^${pattern}$`).test(v);
      }
    }
  });
}

// Strip internal bookkeeping and return a copy so callers can't alias the store.
function clean(row: Row): Row {
  const copy = { ...(row as Record<string, unknown>) };
  delete copy.__seq;
  return copy as Row;
}

class MockQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private head = false;
  private wantSelect = false;
  private singleMode: "single" | "maybe" | null = null;

  constructor(private store: MockStore, private table: TableName) {}

  select(_cols?: string, opts?: { head?: boolean; count?: string }): this {
    this.wantSelect = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ type: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push({ type: "neq", col, val });
    return this;
  }
  is(col: string, val: unknown): this {
    this.filters.push({ type: "is", col, val });
    return this;
  }
  like(col: string, val: unknown): this {
    this.filters.push({ type: "like", col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this {
    this.singleMode = "single";
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }

  private rows(): Row[] {
    return this.store.tables[this.table];
  }

  private exec(): Result {
    const arr = this.rows();
    if (!arr) return { data: null, error: { message: `unknown table ${this.table}` } };

    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const inserted = items.map((it) => {
        this.store.seq += 1;
        const provided = it as Record<string, unknown>;
        const row = {
          ...DEFAULTS[this.table](),
          ...provided,
          id: (provided.id as string) ?? randomUUID(),
          created_at: (provided.created_at as string) ?? new Date().toISOString(),
          __seq: this.store.seq,
        } as Row;
        arr.push(row);
        return row;
      });
      if (!this.wantSelect) return { data: null, error: null };
      return this.singleMode
        ? { data: clean(inserted[0]), error: null }
        : { data: inserted.map(clean), error: null };
    }

    if (this.op === "update") {
      const targets = arr.filter((r) => matches(r, this.filters));
      for (const r of targets) Object.assign(r, this.payload);
      if (!this.wantSelect) return { data: null, error: null };
      if (this.singleMode === "single")
        return targets[0]
          ? { data: clean(targets[0]), error: null }
          : { data: null, error: { message: "no rows found" } };
      if (this.singleMode === "maybe")
        return { data: targets[0] ? clean(targets[0]) : null, error: null };
      return { data: targets.map(clean), error: null };
    }

    if (this.op === "delete") {
      const removed = arr.filter((r) => matches(r, this.filters));
      this.store.tables[this.table] = arr.filter((r) => !matches(r, this.filters));
      return { data: null, error: null, count: removed.length };
    }

    // select
    let result = arr.filter((r) => matches(r, this.filters));
    const count = result.length;
    if (this.orderCol) {
      const col = this.orderCol;
      const dir = this.orderAsc ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = (a as Record<string, unknown>)[col];
        const bv = (b as Record<string, unknown>)[col];
        if (av !== bv) {
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * dir;
        }
        // Stable tiebreak by insertion order.
        return ((Number(a.__seq) - Number(b.__seq)) || 0) * dir;
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    if (this.head) return { data: null, error: null, count };
    if (this.singleMode === "single")
      return result[0]
        ? { data: clean(result[0]), error: null }
        : { data: null, error: { message: "no rows found" } };
    if (this.singleMode === "maybe")
      return { data: result[0] ? clean(result[0]) : null, error: null };
    return { data: result.map(clean), error: null, count };
  }

  then<TR = Result, TE = never>(
    onfulfilled?: ((value: Result) => TR | PromiseLike<TR>) | null,
    onrejected?: ((reason: unknown) => TE | PromiseLike<TE>) | null,
  ): Promise<TR | TE> {
    let res: Result;
    try {
      res = this.exec();
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
    return Promise.resolve(res).then(onfulfilled, onrejected);
  }
}

function mockAuth() {
  return {
    async getUser() {
      return { data: { user: { id: DEMO_USER.id, email: DEMO_USER.email } }, error: null };
    },
    async getSession() {
      return { data: { session: { user: DEMO_USER } }, error: null };
    },
    async signInWithOtp() {
      return { data: {}, error: null };
    },
    async exchangeCodeForSession() {
      return { data: { session: {} }, error: null };
    },
    async signOut() {
      return { error: null };
    },
    admin: {
      async listUsers() {
        return { data: { users: getStore().users }, error: null };
      },
    },
  };
}

function mockStorage() {
  return {
    from(_bucket: string) {
      return {
        async createSignedUploadUrl(path: string) {
          return {
            data: {
              signedUrl: `/api/mock/storage?path=${encodeURIComponent(path)}`,
              path,
              token: "mock-token",
            },
            error: null,
          };
        },
        async download(path: string) {
          const blob = getStore().storage.get(path);
          if (!blob) return { data: null, error: { message: "object not found" } };
          return {
            data: { arrayBuffer: async () => blob.bytes },
            error: null,
          };
        },
      };
    },
    async getBucket(_id: string) {
      return { data: { id: "materials", name: "materials", public: false }, error: null };
    },
  };
}

export function mockSupabaseClient() {
  const store = getStore();
  return {
    from(table: TableName) {
      return new MockQuery(store, table);
    },
    auth: mockAuth(),
    storage: mockStorage(),
  };
}
