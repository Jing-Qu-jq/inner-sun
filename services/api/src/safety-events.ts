import type { Locale } from "@innersun/shared";
import { pool } from "./db.js";
import type { SafetyScreenResult } from "./safety.js";

/**
 * Durable, de-identified record of the turns where crisis screening fired (Feature 9 AC 5).
 *
 * Two properties matter more than anything else about this module.
 *
 * **It stores no student text.** Rule *identifiers*, a category, a classifier label, a model
 * name, a conversation id and a message id — and nothing else. A table of crisis disclosures
 * quoted verbatim would be the most sensitive object in this system; the way to keep it safe
 * is not to build one. Everything an evaluation needs to find the turn is here, and the turn
 * itself is where it always was, in `messages`, under Feature 16's consent rules.
 *
 * **It never fails a turn.** A student who has just disclosed something serious is waiting
 * for a reply, and our bookkeeping is not their problem. A write that errors is logged and
 * the turn proceeds — the reply, the resources and the transcript are all unaffected, and
 * the same event is still on the `crisis screening` log line either way.
 */
export interface SafetyEvent {
  conversationId: string;
  /** The student message that triggered it. Null when it could not be resolved. */
  messageId?: string | null;
  locale: Locale;
  screen: SafetyScreenResult;
  /** Which model the classifier ran on, when it ran. */
  model?: string;
}

export async function recordSafetyEvent(
  event: SafetyEvent,
  log: { error: (obj: object, msg: string) => void },
): Promise<void> {
  try {
    await pool.query(
      `insert into safety_events
         (conversation_id, message_id, category, source, rules, classifier, model, locale)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.conversationId,
        event.messageId ?? null,
        event.screen.category,
        event.screen.source,
        event.screen.rules,
        event.screen.classifier,
        event.model ?? null,
        event.locale,
      ],
    );
  } catch (err) {
    // Deliberately swallowed after logging: see the note above. The `err` object is what
    // pg gives us and can quote parameter values, so it goes to the log and nowhere else.
    log.error({ err, conversationId: event.conversationId }, "failed to record safety event");
  }
}
