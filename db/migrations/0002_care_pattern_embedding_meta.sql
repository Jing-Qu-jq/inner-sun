-- Care Pattern embedding provenance (Feature 6).
--
-- Feature 3 seeded deterministic PLACEHOLDER vectors, which needed no provenance: every
-- row came from the same local function, so a vector was either there or it wasn't.
-- Feature 6 embeds for real via OpenAI, and a real vector has two properties worth
-- recording — which model produced it, and whether it still reflects the row's `situation`.
--
--   embedding_model  Which model produced `embedding`. Makes a model change detectable,
--                    which is what `npm run db:reembed --stale` keys off (Feature 6 AC 4).
--                    The placeholder path (`db:seed --fake`) records 'placeholder' here.
--   embedded_at      When it was produced. Lets "did this save actually re-embed?" be
--                    answered without diffing 1536 floats — which is how Feature 17's
--                    acceptance check confirms an unchanged `situation` skips the call.
--   needs_embedding  True means `embedding` is NOT a real, current embedding of `situation`:
--                    it is null, a Feature 3 placeholder, or the OpenAI call failed on save.
--                    Such a row is invisible to retrieval, which is exactly the silent
--                    failure this feature exists to prevent — so it is flagged rather than
--                    left to look fine. Feature 17 surfaces it as a warning in the admin UI.

alter table care_patterns
  add column embedding_model text,
  add column embedded_at     timestamptz,
  add column needs_embedding boolean not null default false;

-- Any vector already in the table came from Feature 3's placeholder function, so it is
-- not a real embedding no matter how healthy it looks. Flag it for the re-embed sweep
-- instead of letting it masquerade as genuine. No-op on a fresh database, where this
-- migration runs before the first seed.
update care_patterns
   set needs_embedding = true,
       embedding_model = 'placeholder'
 where embedding is not null;

-- The sweep only ever asks for rows that need work, and in steady state that set is
-- empty — so index just those rows rather than the whole table.
create index care_patterns_needs_embedding_idx
  on care_patterns (needs_embedding)
  where needs_embedding;
