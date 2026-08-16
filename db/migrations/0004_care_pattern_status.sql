-- Care Pattern publication lifecycle (Feature 17).
--
-- Replaces the boolean `is_active` with a three-state `status`, and makes **draft** the
-- default. The reason is the default, not the extra state: a newly written pattern used to
-- become retrievable the instant it was saved, so a half-finished thought or a typo in a
-- strategy would reach the next student who matched it. Publishing is now something you
-- choose, and forgetting to choose leaves the harmless outcome.
--
-- Why a third state rather than just flipping the boolean's default: `is_active = false`
-- would then mean two unrelated things — "not written yet" and "withdrawn because it was
-- wrong". The admin UI would have to label a brand-new draft "retired", which is exactly
-- backwards, and nothing could tell the two apart when reviewing the library.
--
--   draft      written but never published; invisible to retrieval
--   published  live; the only state retrieval considers
--   retired    was live, deliberately withdrawn; kept for the record and restorable
--
-- Done now rather than at deployment because a safety default that depends on someone
-- remembering to change it later is one that does not get changed.

alter table care_patterns
  add column status text not null default 'draft'
    check (status in ('draft', 'published', 'retired'));

-- Existing rows were all created under the old always-active behaviour, and the starter
-- set is what Feature 6's retrieval checks match against, so they carry over as published.
update care_patterns set status = case when is_active then 'published' else 'retired' end;

alter table care_patterns drop column is_active;

-- Retrieval only ever asks for published rows, and reaches for the HNSW vector index
-- rather than this one; this keeps the admin list and any status filter cheap.
create index care_patterns_status_idx on care_patterns (status);

-- The audit trail gains the two transitions the boolean could not express. Postgres has
-- no "alter check constraint", so the old one is replaced.
alter table care_pattern_revisions
  drop constraint care_pattern_revisions_action_check;
alter table care_pattern_revisions
  add constraint care_pattern_revisions_action_check
    check (action in ('create', 'update', 'publish', 'retire', 'restore'));
