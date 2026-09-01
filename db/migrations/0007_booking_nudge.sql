-- The booking nudge, recorded once per conversation (Feature 11 AC 1).
--
-- The whole funnel this product exists for ends in a student booking a session with a real
-- human counselor, and the nudge is the moment we ask. AC 1's hard requirement is that it
-- happens **at most once per conversation** — a companion that keeps steering a conversation
-- back to "have you thought about booking someone?" stops being a companion and starts being
-- a sales funnel, which is the fastest way to lose the trust the nudge depends on.
--
-- Why a column and not a log line
--
-- "At most once" is a fact that has to survive an API restart, and it has to be true across
-- two instances rather than merely per-process. The readiness check itself is stateless and
-- rule-based; this column is the only state it keeps.
--
-- Why a timestamp and not a boolean
--
-- A boolean answers "did we nudge?" and nothing else. The timestamp additionally answers
-- *when* in the conversation it happened, which is the question Feature 19 will actually be
-- asking of it: a nudge that fires on turn 2 and a nudge that fires on turn 12 convert very
-- differently, and the thresholds in services/api/src/booking.ts are chosen rather than
-- measured (see docs/PLAN.md Feature 11) precisely because no such data exists yet. Nulls
-- are the ordinary case and cost nothing.
--
-- The claim is atomic, on purpose
--
-- The server sets this with `update ... where booking_nudged_at is null`, and only the turn
-- whose update reports a row proceeds to nudge. Two concurrent turns on one conversation
-- would otherwise both read "not nudged yet", both nudge, and produce exactly the nagging
-- AC 1 forbids — the same optimistic-concurrency reasoning as `summarized_message_count` in
-- 0005. It is also released back to null when the reply call fails, so an OpenAI hiccup does
-- not silently consume a conversation's one and only nudge.
--
-- No student text, and nothing identifying, as everywhere else in this schema: whether we
-- asked, and when.

alter table conversations
  add column booking_nudged_at timestamptz;

comment on column conversations.booking_nudged_at is
  'When the booking nudge fired for this conversation (Feature 11). Null means it has not; it fires at most once.';
