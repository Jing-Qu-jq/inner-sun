-- Researcher admin tool: accounts and change history (Feature 17).
--
-- Why a table separate from `users`: these are two different populations with two
-- different risk profiles. Students are anonymous-first — most never create an account at
-- all, and Feature 12 may hand their authentication to Supabase Auth. Admins are a closed
-- list of two or three colleagues who are added by hand and who can rewrite the clinical
-- knowledge base. Coupling them would block this tool behind an unbuilt feature and would
-- put "can edit every Care Pattern" one bad role check away from every student row.

-- admin_users ----------------------------------------------------------------
-- Populated only by `npm run admin:create`. There is deliberately no signup route:
-- the entire population is people the team already knows.
create table admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  -- Argon2id encoded hash (contains its own salt and parameters). Never a plaintext
  -- password, and never sent to the client — not even to the account's own owner.
  password_hash text not null,
  display_name  text not null,
  -- 'researcher' authors patterns; 'admin' can also manage accounts. Kept as a checked
  -- text column rather than an enum type so adding a role later is an ordinary migration.
  role          text not null default 'researcher' check (role in ('researcher', 'admin')),
  -- Revoke access without deleting the row: revisions reference the author, and an
  -- audit trail that loses its actor when someone leaves is not an audit trail.
  is_active     boolean not null default true,
  -- Set when an account is created with a temporary password, cleared once changed.
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger admin_users_set_updated_at
  before update on admin_users
  for each row execute function set_updated_at();

-- admin_sessions -------------------------------------------------------------
-- Server-side sessions, so signing out actually revokes access rather than merely
-- clearing the browser's copy of a token that stays valid until it expires. For a tool
-- guarding the company's core clinical IP, revocation needs to be real: if a laptop is
-- lost, deactivating the account and deleting its sessions must end access immediately.
--
-- The cookie carries a random opaque token and this table stores only its SHA-256 hash,
-- exactly as with passwords — a leaked database backup then yields no usable sessions.
create table admin_sessions (
  -- The token hash is the primary key: lookup is by what the cookie presents.
  token_hash    text primary key,
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index admin_sessions_user_idx on admin_sessions (admin_user_id);
create index admin_sessions_expiry_idx on admin_sessions (expires_at);

-- care_pattern_revisions -----------------------------------------------------
-- One row per change, written in the SAME transaction as the change itself, so a
-- pattern cannot be edited without leaving a record — the audit is part of the write,
-- not a courtesy call afterwards that a failure could skip.
--
-- `before` and `after` hold whole-row JSON snapshots rather than a field-level diff.
-- Snapshots make "what did this look like in March?" answerable and let a bad edit be
-- restored by hand; computing a diff for display is easy, recovering a lost state is not.
-- Embeddings are excluded from the snapshots — 1536 floats per revision would dominate
-- the table to store something regenerable from `situation`.
create table care_pattern_revisions (
  id              uuid primary key default gen_random_uuid(),
  -- No FK cascade to care_patterns: patterns are retired via is_active rather than
  -- deleted, and if one ever is deleted the history of it should outlive the row.
  care_pattern_id uuid not null,
  -- Null only if an account were hard-deleted, which is why deactivation is preferred.
  admin_user_id   uuid references admin_users(id) on delete set null,
  action          text not null check (action in ('create', 'update', 'retire', 'restore')),
  before          jsonb,           -- null on 'create'
  after           jsonb not null,
  created_at      timestamptz not null default now()
);
create index care_pattern_revisions_pattern_idx
  on care_pattern_revisions (care_pattern_id, created_at desc);
create index care_pattern_revisions_author_idx
  on care_pattern_revisions (admin_user_id, created_at desc);
