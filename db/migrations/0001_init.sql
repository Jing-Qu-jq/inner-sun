-- InnerSun initial schema (Feature 3).
-- PostgreSQL 16 + pgvector. Applied by the migration runner (db/scripts/migrate.ts),
-- which wraps each file in its own transaction and records it in schema_migrations.
--
-- Design notes:
--   * One database holds relational data AND Care-Pattern embeddings (per docs/ARCHITECTURE.md) —
--     no separate vector store at V1 scale.
--   * Auth: for local dev this `users` table is standalone. When Supabase Auth lands (Feature 12)
--     it can be reconciled with `auth.users`. Anonymous chat needs no user row (ephemeral session).
--   * Embedding dimension 1536 = OpenAI text-embedding-3-small (Feature 6 embeds for real).

-- Extensions -----------------------------------------------------------------
create extension if not exists vector;   -- pgvector: the `vector` column type + distance operators.
-- gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto needed on PG16).

-- Shared trigger to keep updated_at fresh on row updates ----------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- users ----------------------------------------------------------------------
-- Registered users. Anonymous visitors do NOT get a row (see Feature 12).
create table users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  display_name text,
  locale       text not null default 'en' check (locale in ('en', 'zh-CN')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- care_patterns --------------------------------------------------------------
-- The proprietary, researcher-authored clinical knowledge base. `situation` is the
-- field that gets embedded (once, on save) into `embedding` for vector retrieval.
-- Fields mirror the shared CarePattern type (packages/shared). Seeded for real in Feature 6.
create table care_patterns (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  situation    text not null,                                  -- embedded → matching
  signals      text[] not null default '{}',                   -- observable cues
  strategies   text[] not null default '{}',                   -- what the counselor should do
  avoid        text[] not null default '{}',                   -- what NOT to do
  escalation   text not null default '',                       -- when to route to a human
  source_refs  text[] not null default '{}',                   -- paper citations (clinical traceability)
  locale_notes jsonb not null default '{}'::jsonb,             -- {"en": "...", "zh-CN": "..."} cultural nuance
  embedding    vector(1536),                                    -- text-embedding-3-small; null until embedded
  is_active    boolean not null default true,                   -- retire without deleting (Feature 17)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger care_patterns_set_updated_at
  before update on care_patterns
  for each row execute function set_updated_at();

-- Cosine-distance ANN index for top-N Care-Pattern retrieval.
-- HNSW needs no training data (unlike ivfflat) and matches the `<=>` cosine operator used at query time.
create index care_patterns_embedding_hnsw
  on care_patterns
  using hnsw (embedding vector_cosine_ops);

-- conversations --------------------------------------------------------------
-- A chat session. user_id is null for anonymous sessions. `summary` holds the
-- running summary used for matching / history compaction (Features 8, 14).
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,   -- null = anonymous
  locale          text not null default 'en' check (locale in ('en', 'zh-CN')),
  summary         text,
  started_at      timestamptz not null default now(),
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index conversations_user_id_idx on conversations(user_id);
create trigger conversations_set_updated_at
  before update on conversations
  for each row execute function set_updated_at();

-- messages -------------------------------------------------------------------
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('system', 'user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);

-- consents -------------------------------------------------------------------
-- Consent choices (e.g. logging, using conversations to improve the service).
-- Foundation for the data flywheel + compliance (Feature 16). Scoped to a user
-- and/or a conversation (anonymous consent attaches to the conversation).
create table consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  consent_type    text not null,        -- e.g. 'logging', 'service_improvement'
  granted         boolean not null,
  created_at      timestamptz not null default now()
);
create index consents_user_id_idx on consents(user_id);
create index consents_conversation_id_idx on consents(conversation_id);

-- bookings -------------------------------------------------------------------
-- A request to talk to a real human counselor — the core conversion (Feature 11).
create table bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  status          text not null default 'requested'
                    check (status in ('requested', 'confirmed', 'cancelled', 'completed')),
  contact_email   text,
  preferred_time  text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- canned_responses -----------------------------------------------------------
-- Pre-defined FAQ answers (Feature 10). DB-backed so non-engineers can edit without
-- a deploy. Bilingual JSON: {"en": "...", "zh-CN": "..."}. NOT LLM-generated, not cached.
create table canned_responses (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,                 -- stable identifier, e.g. 'is_confidential'
  question   jsonb not null default '{}'::jsonb,   -- display label per locale
  answer     jsonb not null,                       -- the canned answer per locale
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger canned_responses_set_updated_at
  before update on canned_responses
  for each row execute function set_updated_at();
