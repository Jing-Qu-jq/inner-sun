-- History summarization and per-turn token accounting (Feature 8).
--
-- Two independent cost controls, in one migration because they are two halves of the same
-- feature: one keeps a long conversation's prompt from growing without bound, the other
-- makes what that saves measurable rather than asserted.
--
-- 1. Summarization progress on `conversations`
--
-- The `summary` column has existed since 0001 and has always been null: Feature 5 replayed
-- a fixed window of recent messages and let older ones fall off the end of the prompt
-- entirely. That is bounded but lossy — twenty messages in, the model no longer knows what
-- the student opened with. Feature 8 folds those older messages into `summary` instead, so
-- the prompt stays the same size while the conversation stays whole.
--
-- Writing the summary is not enough on its own: the server also has to know **how much of
-- the transcript it already covers**, or the next turn would either summarize the same
-- messages again or resend messages the summary already describes. `summarized_message_count`
-- is that boundary — the number of oldest messages, in (created_at, id) order, that
-- `summary` stands in for. Zero means nothing has been folded in yet, which is the correct
-- reading of every conversation that exists today.
--
-- A count rather than a foreign key to the last summarized message: messages are only ever
-- appended to a conversation and are deleted only with it (0001 cascades them), so an
-- offset is stable, and it survives the row it points past being erased for a Feature 16
-- deletion request. It is also the number worth seeing directly in a table viewer.
--
-- 2. Token usage on `messages`
--
-- `usage` records what a turn cost, on the assistant message that turn produced: every
-- upstream call (match query, embedding, summary, reply), its model and its token counts,
-- plus an estimated USD figure. Null on user messages, and null on assistant messages
-- written before this migration.
--
-- jsonb rather than a set of integer columns because the *shape* is still moving — Feature 9
-- adds a crisis-screening call and Feature 10 a canned-answer path that makes some turns cost
-- nothing at all — and because the interesting query is an aggregate over the whole document
-- rather than a filter on one column. The unit cost this exists to watch is then one query:
--
--   select conversation_id, round(sum((usage->>'costUsd')::numeric), 4) as usd
--     from messages where usage is not null group by conversation_id;
--
-- It is observability, not billing: the prices live in application code and drift when
-- OpenAI's do. The authoritative number is always the one on the OpenAI invoice.

alter table conversations
  add column summarized_message_count integer not null default 0
    check (summarized_message_count >= 0),
  add column summary_updated_at timestamptz;

comment on column conversations.summary is
  'Running English summary of the oldest messages, standing in for them in the prompt (Feature 8).';
comment on column conversations.summarized_message_count is
  'How many of the oldest messages `summary` covers, in (created_at, id) order.';

alter table messages
  add column usage jsonb;

comment on column messages.usage is
  'What this turn cost: per-call model and token counts plus an estimated USD figure (Feature 8). Assistant messages only.';
