import type { QueryResultRow } from "pg";
import type { ChatDebugCall, ChatMessage, ChatTokenUsage, Locale } from "@innersun/shared";
import { pool } from "./db.js";
import { AppError } from "./errors.js";

/**
 * Conversation history, stored in PostgreSQL (Feature 5).
 *
 * This replaces the in-memory Map that Feature 4 used as scaffolding. History
 * now lives in the `conversations` and `messages` tables from Feature 3, so a
 * conversation id keeps working across an API restart and would keep working
 * across more than one instance. It is also what later features read: analytics
 * in Feature 14 and the export/delete obligations in Feature 16 both need the
 * transcript to exist somewhere.
 *
 * Feature 8 added the running summary that Feature 5 anticipated. Nothing is deleted
 * when a conversation is compacted — the oldest messages simply stop being *replayed*,
 * with `summary` standing in for them and `summarized_message_count` recording how far
 * it reaches. The full transcript is still on record, which is what makes it possible to
 * re-summarize differently later, or to hand a student their whole conversation.
 *
 * `user_id` stays null for now — every conversation is anonymous until accounts
 * arrive in Feature 12.
 */

interface Conversation {
  id: string;
  locale: Locale;
  /**
   * Running summary of the earlier messages, standing in for them in the prompt (Feature 8).
   * Null until a conversation first grows past the verbatim window. Also read by Feature 7's
   * match query, which is built from "summary + the student's recent messages".
   */
  summary: string | null;
  /**
   * How many of the oldest messages `summary` covers, in the same order they are replayed.
   * The boundary between "described by the summary" and "sent word for word"; zero means
   * nothing has been folded in yet.
   */
  summarizedMessageCount: number;
}

/** The columns that make up a Conversation, aliased to their TypeScript names. */
const CONVERSATION_COLUMNS = `id, locale, summary,
        summarized_message_count as "summarizedMessageCount"`;

/** Start a new anonymous conversation and return it. */
export async function createConversation(locale: Locale): Promise<Conversation> {
  const { rows } = await query<Conversation>(
    `insert into conversations (locale) values ($1) returning ${CONVERSATION_COLUMNS}`,
    [locale],
  );
  return rows[0]!;
}

/**
 * Look up an existing conversation, or undefined when there is no such row.
 *
 * Callers surface that as a 404 rather than silently adopting a client-supplied
 * id, so a conversation id always denotes a conversation this server really
 * created. Unlike Feature 4's in-memory version, "no such row" no longer means
 * "you restarted the server" — it means the conversation was never created here
 * or the database has been reset.
 */
export async function getConversation(id: string): Promise<Conversation | undefined> {
  const { rows } = await query<Conversation>(
    `select ${CONVERSATION_COLUMNS} from conversations where id = $1`,
    [id],
  );
  return rows[0];
}

/**
 * Record a language change on an existing conversation, so a mid-conversation
 * switch of the nav toggle sticks for subsequent turns.
 */
export async function updateConversationLocale(id: string, locale: Locale): Promise<void> {
  await query(`update conversations set locale = $1 where id = $2 and locale is distinct from $1`, [locale, id]);
}

/** How many messages a conversation holds — the input to the compaction plan (Feature 8). */
export async function countMessages(conversationId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(`select count(*) as count from messages where conversation_id = $1`, [
    conversationId,
  ]);
  return Number(rows[0]?.count ?? 0);
}

/**
 * The most recent `limit` messages of a conversation, oldest first — the shape the model
 * wants. Callers pass a limit computed from the compaction plan, so that the messages the
 * summary already covers are never also replayed in full.
 *
 * The system prompt is deliberately not stored or replayed: it is rebuilt on
 * every turn from the current locale and (from Feature 7) the Care Patterns
 * retrieved for that turn, so a stored copy would be a stale one.
 */
export async function loadHistory(conversationId: string, limit: number): Promise<ChatMessage[]> {
  if (limit <= 0) return [];
  // Take the newest `limit` rows, then flip back to chronological order: an
  // `order by created_at asc limit n` would keep the *oldest* turns instead.
  const { rows } = await query<{ role: ChatMessage["role"]; content: string }>(
    `select role, content
       from (
         select role, content, created_at, id
           from messages
          where conversation_id = $1
          order by created_at desc, id desc
          limit $2
       ) recent
      order by created_at asc, id asc`,
    [conversationId, limit],
  );
  return rows;
}

/**
 * A contiguous slice of the transcript, oldest first — the messages about to be folded
 * into the summary (Feature 8). `offset` is the current `summarizedMessageCount`, so the
 * slice always starts exactly where the existing summary stops.
 */
export async function loadMessageRange(
  conversationId: string,
  offset: number,
  limit: number,
): Promise<ChatMessage[]> {
  if (limit <= 0) return [];
  const { rows } = await query<{ role: ChatMessage["role"]; content: string }>(
    `select role, content
       from messages
      where conversation_id = $1
      order by created_at asc, id asc
      offset $2
      limit $3`,
    [conversationId, offset, limit],
  );
  return rows;
}

/**
 * Store a new running summary and move the boundary it covers (Feature 8).
 *
 * The `where` clause is optimistic concurrency, not decoration. Two turns of the same
 * conversation running at once would both read the same `summarizedMessageCount`, both
 * summarize the same slice, and the second write would move the boundary twice — silently
 * hiding a batch of messages from the model with nothing to show it had happened. Guarding
 * on the count the caller read means the loser writes nothing and simply tries again next
 * turn. Returns whether the write landed.
 */
export async function saveSummary(
  conversationId: string,
  summary: string,
  expectedCount: number,
  newCount: number,
): Promise<boolean> {
  const { rowCount } = await query(
    `update conversations
        set summary = $1,
            summarized_message_count = $2,
            summary_updated_at = now()
      where id = $3
        and summarized_message_count = $4`,
    [summary, newCount, conversationId, expectedCount],
  );
  return (rowCount ?? 0) > 0;
}

/** What one turn spent, as stored on the assistant message it produced (migration 0005). */
export interface StoredUsage {
  calls: ChatDebugCall[];
  totals: ChatTokenUsage;
  costUsd: number;
}

/**
 * Estimated cost of a whole conversation, summed from what each turn recorded.
 *
 * This is the "~$0.05 per conversation" number the plan's economics rest on, read straight
 * from the transcript rather than reconstructed from logs. Turns written before Feature 8,
 * and user messages, have no `usage` and contribute nothing.
 */
export async function conversationCostUsd(conversationId: string): Promise<number> {
  const { rows } = await query<{ cost: string | null }>(
    `select coalesce(sum((usage->>'costUsd')::numeric), 0) as cost
       from messages
      where conversation_id = $1 and usage is not null`,
    [conversationId],
  );
  return Number(rows[0]?.cost ?? 0);
}

/**
 * Append one turn and mark the conversation as freshly active.
 *
 * `usage` is what the turn cost (Feature 8) and is attached to the assistant message the
 * turn produced. It is deliberately part of the same statement as the insert: a cost record
 * written separately is one that can go missing exactly when a turn was unusually expensive.
 */
export async function appendMessage(
  conversationId: string,
  message: ChatMessage,
  usage?: StoredUsage,
): Promise<string> {
  // Both statements in one round trip. The CTE runs the insert, the update is driven off
  // its result so the two cannot disagree about which row to touch, and the trailing select
  // hands back the new message's id — which Feature 9 attaches a safety event to, so a
  // crisis trigger points at the exact turn that produced it rather than at the whole
  // conversation. A data-modifying CTE cannot be read from an UPDATE's own RETURNING, hence
  // the final SELECT rather than a third statement.
  const { rows } = await query<{ id: string }>(
    `with inserted as (
       insert into messages (conversation_id, role, content, usage)
       values ($1, $2, $3, $4)
       returning id, conversation_id
     ), touched as (
       update conversations
          set last_message_at = now()
        where id = (select conversation_id from inserted)
     )
     select id from inserted`,
    [conversationId, message.role, message.content, usage ? JSON.stringify(usage) : null],
  );
  return rows[0]!.id;
}

/**
 * Every query goes through here so that a database problem reaches the client as
 * a deliberate 503 rather than an unplanned 500. The original error is kept as
 * `cause` for the log — a pg error message can quote row values, so it must not
 * become the client-facing text.
 */
async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[]) {
  try {
    return await pool.query<T>(text, values);
  } catch (err) {
    throw new AppError(
      503,
      "storage_unavailable",
      "We couldn't reach the conversation store. Please try again in a moment.",
      { cause: err },
    );
  }
}

export type { Conversation };
