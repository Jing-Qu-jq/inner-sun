-- Crisis screening events (Feature 9 AC 5).
--
-- Every turn is screened for crisis signals before the reply is written. This table records
-- the turns where that screening FIRED — what fired, and what kind of risk it thought it saw.
--
-- Why a table and not just a log line
--
-- The log already carries a `crisis screening` line for every turn, positives and negatives
-- alike, and that is where the negatives live. But logs are rotated, sampled and hard to
-- aggregate, and the DS roadmap (docs/ARCHITECTURE.md §8, item 6) calls for *measuring recall
-- of the v1 safety layer* — which means someone will one day want "every trigger in the last
-- three months, by category and by detector" as a query rather than as a grep. Triggers are
-- rare, so storing them costs almost nothing.
--
-- What is deliberately NOT here
--
-- No message content, no summary, no matched phrase. `rules` holds rule IDENTIFIERS — the
-- string `self-harm.kill-myself`, never the sentence that matched it — which is the same
-- discipline every log line in this service follows: it says what happened, never what was
-- said. That is what "de-identified" means in AC 5, and it is not incidental: a table of
-- crisis disclosures quoted verbatim would be the single most sensitive object in this
-- system, and the way to keep it safe is not to create it.
--
-- `conversation_id` is kept, because without it nothing can be evaluated at all — a bare
-- count of triggers cannot tell a false positive from a true one. It is pseudonymous: every
-- conversation is anonymous (`user_id` is null until Feature 12), and it cascades on delete
-- so a Feature 16 erasure request takes these rows with it.
--
-- `message_id` narrows that to the exact turn, which is what makes review possible without
-- reading a whole transcript. It is nullable and `on delete set null` so that redacting one
-- message never destroys the evidence that a trigger happened.
--
-- Measuring RECALL — misses, not hits — needs the turns where screening said "no" and should
-- have said "yes". Those are not rows here by construction: they are found by re-reading
-- transcripts (with consent, under Feature 16) and comparing against this table. Recording a
-- row per turn would make that one query instead, and would also mean a table with a row for
-- every message in the product; that trade is worth revisiting when the evaluation is
-- actually built, and is noted rather than pre-judged here.

create table safety_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id      uuid references messages(id) on delete set null,
  -- self_harm | harm_to_others | abuse_or_violence | medical_emergency
  category        text not null,
  -- Which detector decided: the phrase lexicon, the classifier, or both.
  source          text not null check (source in ('rules', 'classifier', 'both')),
  -- Identifiers of the phrase rules that fired. Empty when the classifier decided alone.
  rules           text[] not null default '{}',
  -- The classifier's raw label, or 'skipped' / 'unparsed' / 'failed'.
  classifier      text,
  -- Which model answered, so a change in screening behaviour can be attributed.
  model           text,
  locale          text not null default 'en' check (locale in ('en', 'zh-CN')),
  created_at      timestamptz not null default now()
);

create index safety_events_conversation_idx on safety_events(conversation_id, created_at);
create index safety_events_created_idx on safety_events(created_at desc);

comment on table safety_events is
  'Turns where crisis screening fired (Feature 9). De-identified: rule ids and labels only, never message content.';
comment on column safety_events.rules is
  'Rule identifiers that matched, e.g. self-harm.kill-myself. Never the matched phrase.';
