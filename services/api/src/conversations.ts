import type { QueryResultRow } from "pg";
import type { ChatMessage, Locale } from "@innersun/shared";
import { pool } from "./db.js";
import { AppError } from "./errors.js";

/**
 * Conversation history, stored in PostgreSQL (Feature 5).
 *
 * This replaces the in-memory Map that Feature 4 used as scaffolding. History
 * now lives in the `conversations` and `messages` tables from Feature 3, so a
 * conversation id keeps working across an API restart and would keep working
 * across more than one instance. It is also what later features read: the
 * running summary in Feature 8, analytics in Feature 14, and the export/delete
 * obligations in Feature 16 all need the transcript to exist somewhere.
 *
 * `user_id` stays null for now — every conversation is anonymous until accounts
 * arrive in Feature 12.
 */

/**
 * How many recent turns are replayed to the model. Older turns stay in the
 * database; they are simply not sent upstream, which caps prompt cost on a long
 * conversation. Feature 8 replaces this hard cut-off with summarization, and
 * the fact that nothing is deleted here is what makes that possible.
 */
const HISTORY_WINDOW = 20;

interface Conversation {
  id: string;
  locale: Locale;
}

/** Start a new anonymous conversation and return it. */
export async function createConversation(locale: Locale): Promise<Conversation> {
  const { rows } = await query<{ id: string; locale: Locale }>(
    `insert into conversations (locale) values ($1) returning id, locale`,
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
  const { rows } = await query<{ id: string; locale: Locale }>(
    `select id, locale from conversations where id = $1`,
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

/**
 * The recent turns of a conversation, oldest first — the shape the model wants.
 *
 * The system prompt is deliberately not stored or replayed: it is rebuilt on
 * every turn from the current locale and (from Feature 7) the Care Patterns
 * retrieved for that turn, so a stored copy would be a stale one.
 */
export async function loadHistory(conversationId: string, limit: number = HISTORY_WINDOW): Promise<ChatMessage[]> {
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

/** Append one turn and mark the conversation as freshly active. */
export async function appendMessage(conversationId: string, message: ChatMessage): Promise<void> {
  // Both statements in one round trip. The CTE runs the insert, and the update
  // is driven off its result so the two cannot disagree about which row to touch.
  await query(
    `with inserted as (
       insert into messages (conversation_id, role, content)
       values ($1, $2, $3)
       returning conversation_id
     )
     update conversations
        set last_message_at = now()
      where id = (select conversation_id from inserted)`,
    [conversationId, message.role, message.content],
  );
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
export { HISTORY_WINDOW };
