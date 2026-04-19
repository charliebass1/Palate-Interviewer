-- Palate Interviewer — initial schema
-- Tables: projects, materials, material_chunks (pgvector),
--         interview_guides, interviews, transcripts, summaries, themes

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- -------------------------------------------------------------------
-- Projects: a research engagement (5–20 interviews on the same topic)
-- -------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  topic         text,
  client        text,
  status        text not null default 'active'
                check (status in ('active','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);

-- -------------------------------------------------------------------
-- Materials: uploaded files (PDFs, decks, survey exports, pricing sheets)
-- -------------------------------------------------------------------
create table if not exists public.materials (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  mime_type     text,
  size_bytes    bigint,
  parse_status  text not null default 'pending'
                check (parse_status in ('pending','parsing','parsed','failed')),
  parse_error   text,
  extracted_text text,
  created_at    timestamptz not null default now()
);

create index if not exists materials_project_idx on public.materials(project_id);

-- -------------------------------------------------------------------
-- Material chunks: embedded for RAG during guide generation
-- 1536 dims matches Anthropic's recommended small embedding models
-- (swap to 3072 if using a larger embedding model).
-- -------------------------------------------------------------------
create table if not exists public.material_chunks (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references public.materials(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  token_count   int,
  embedding     vector(1536),
  created_at    timestamptz not null default now()
);

create index if not exists material_chunks_project_idx on public.material_chunks(project_id);
create index if not exists material_chunks_material_idx on public.material_chunks(material_id);
create index if not exists material_chunks_embedding_idx
  on public.material_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- -------------------------------------------------------------------
-- Interview guides: Claude-generated, per project
-- -------------------------------------------------------------------
create table if not exists public.interview_guides (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  version       int not null default 1,
  objective     text,
  persona_target text,
  guide_json    jsonb not null,            -- {sections:[{title, questions:[{text, probes:[...]}]}]}
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists guides_project_idx on public.interview_guides(project_id);

-- -------------------------------------------------------------------
-- Interviews: a single 30-min expert call
-- -------------------------------------------------------------------
create table if not exists public.interviews (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  guide_id       uuid references public.interview_guides(id) on delete set null,
  expert_name    text,
  expert_role    text,
  expert_segment text,                     -- operator, distributor, broker, chef, etc.
  scheduled_at   timestamptz,
  status         text not null default 'scheduled'
                 check (status in ('scheduled','in_progress','completed','failed','cancelled')),
  vapi_call_id   text,
  started_at     timestamptz,
  ended_at       timestamptz,
  duration_sec   int,
  created_at     timestamptz not null default now()
);

create index if not exists interviews_project_idx on public.interviews(project_id);
create unique index if not exists interviews_vapi_call_id_uniq
  on public.interviews(vapi_call_id) where vapi_call_id is not null;

-- -------------------------------------------------------------------
-- Transcripts: raw + diarized transcript for each interview
-- -------------------------------------------------------------------
create table if not exists public.transcripts (
  id            uuid primary key default gen_random_uuid(),
  interview_id  uuid not null references public.interviews(id) on delete cascade,
  source        text not null default 'deepgram'
                check (source in ('deepgram','vapi','manual')),
  language      text default 'en',
  raw_text      text,
  segments      jsonb,                     -- [{speaker, start_ms, end_ms, text}]
  created_at    timestamptz not null default now()
);

create index if not exists transcripts_interview_idx on public.transcripts(interview_id);

-- -------------------------------------------------------------------
-- Summaries: Claude post-call analysis per interview
-- -------------------------------------------------------------------
create table if not exists public.summaries (
  id            uuid primary key default gen_random_uuid(),
  interview_id  uuid not null references public.interviews(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  insights      jsonb not null,            -- top 5 insights
  quotes        jsonb not null,            -- [{speaker, text, timestamp_ms}]
  sentiment     jsonb,                     -- {overall, flags:[...]}
  follow_up_flags jsonb,                   -- [{reason, question}]
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists summaries_interview_idx on public.summaries(interview_id);
create index if not exists summaries_project_idx on public.summaries(project_id);

-- -------------------------------------------------------------------
-- Themes: cross-interview synthesis (multi-call insights)
-- -------------------------------------------------------------------
create table if not exists public.themes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         text not null,
  description   text,
  supporting_quotes jsonb,                 -- [{interview_id, quote, speaker}]
  confidence    numeric(3,2),
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists themes_project_idx on public.themes(project_id);

-- -------------------------------------------------------------------
-- RLS — owner-scoped access via auth.uid()
-- -------------------------------------------------------------------
alter table public.projects           enable row level security;
alter table public.materials          enable row level security;
alter table public.material_chunks    enable row level security;
alter table public.interview_guides   enable row level security;
alter table public.interviews         enable row level security;
alter table public.transcripts        enable row level security;
alter table public.summaries          enable row level security;
alter table public.themes             enable row level security;

create policy "projects owner read"   on public.projects  for select using (owner_id = auth.uid());
create policy "projects owner write"  on public.projects  for all    using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "materials owner read"  on public.materials for select using (
  exists (select 1 from public.projects p where p.id = materials.project_id and p.owner_id = auth.uid())
);
create policy "materials owner write" on public.materials for all using (
  exists (select 1 from public.projects p where p.id = materials.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = materials.project_id and p.owner_id = auth.uid())
);

create policy "chunks owner read"     on public.material_chunks for select using (
  exists (select 1 from public.projects p where p.id = material_chunks.project_id and p.owner_id = auth.uid())
);
create policy "chunks owner write"    on public.material_chunks for all using (
  exists (select 1 from public.projects p where p.id = material_chunks.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = material_chunks.project_id and p.owner_id = auth.uid())
);

create policy "guides owner read"     on public.interview_guides for select using (
  exists (select 1 from public.projects p where p.id = interview_guides.project_id and p.owner_id = auth.uid())
);
create policy "guides owner write"    on public.interview_guides for all using (
  exists (select 1 from public.projects p where p.id = interview_guides.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = interview_guides.project_id and p.owner_id = auth.uid())
);

create policy "interviews owner read" on public.interviews for select using (
  exists (select 1 from public.projects p where p.id = interviews.project_id and p.owner_id = auth.uid())
);
create policy "interviews owner write" on public.interviews for all using (
  exists (select 1 from public.projects p where p.id = interviews.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = interviews.project_id and p.owner_id = auth.uid())
);

create policy "transcripts owner read" on public.transcripts for select using (
  exists (
    select 1 from public.interviews i
    join public.projects p on p.id = i.project_id
    where i.id = transcripts.interview_id and p.owner_id = auth.uid()
  )
);
create policy "transcripts owner write" on public.transcripts for all using (
  exists (
    select 1 from public.interviews i
    join public.projects p on p.id = i.project_id
    where i.id = transcripts.interview_id and p.owner_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.interviews i
    join public.projects p on p.id = i.project_id
    where i.id = transcripts.interview_id and p.owner_id = auth.uid()
  )
);

create policy "summaries owner read"  on public.summaries for select using (
  exists (select 1 from public.projects p where p.id = summaries.project_id and p.owner_id = auth.uid())
);
create policy "summaries owner write" on public.summaries for all using (
  exists (select 1 from public.projects p where p.id = summaries.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = summaries.project_id and p.owner_id = auth.uid())
);

create policy "themes owner read"     on public.themes for select using (
  exists (select 1 from public.projects p where p.id = themes.project_id and p.owner_id = auth.uid())
);
create policy "themes owner write"    on public.themes for all using (
  exists (select 1 from public.projects p where p.id = themes.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p where p.id = themes.project_id and p.owner_id = auth.uid())
);

-- -------------------------------------------------------------------
-- Vector search RPC: nearest chunks for a project given a query embedding
-- -------------------------------------------------------------------
create or replace function public.match_chunks(
  query_embedding vector(1536),
  target_project_id uuid,
  match_count int default 12
)
returns table (
  id uuid,
  material_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    mc.id,
    mc.material_id,
    mc.content,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.material_chunks mc
  where mc.project_id = target_project_id
    and mc.embedding is not null
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;
