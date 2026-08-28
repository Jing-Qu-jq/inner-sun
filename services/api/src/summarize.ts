import type { ChatMessage } from "@innersun/shared";
import { config } from "./config.js";
import { loadMessageRange, saveSummary, type Conversation } from "./conversations.js";
import { createChatCompletion } from "./openai.js";
import { loadPrompt } from "./prompt.js";
import type { RawCall } from "./usage.js";

/**
 * History summarization — the cost control that keeps a long conversation affordable
 * without making it forgetful (Feature 8 AC 3).
 *
 * Before this, `POST /chat` replayed a fixed window of recent messages and everything older
 * simply fell off the front of the prompt. That bounds cost, and it is why a student twenty
 * messages in could tell the companion something and have it forgotten three exchanges
 * later. Now the messages leaving the window are distilled into a running summary that goes
 * into the prompt in their place: the prompt stays roughly the same size, the conversation
 * stays whole, and the transcript itself is never touched.
 *
 * Two properties are load-bearing:
 *
 *   • **It runs on the cheap model.** A summary is a mechanical task, so it is `gpt-4o-mini`
 *     work (AC 2). Paying reply-model prices to compress a conversation would spend most of
 *     what the compression saves.
 *   • **It never fails a turn.** A summarization that errors leaves the boundary where it
 *     was and the turn proceeds on the verbatim window alone — which is exactly the behavior
 *     that shipped in Feature 5. The student waits for a reply, not for bookkeeping.
 */

const SUMMARIZE_PROMPT = loadPrompt("summarize.md");

/**
 * Ceiling on the text handed to the summarizer, in characters.
 *
 * The batch is normally ten messages, but a student who writes at length can make ten
 * messages very long, and the guard is what stops a cheap call turning into an expensive
 * one. Trimmed from the FRONT so the newest of the batch survive — the same choice, for the
 * same reason, as the match-source trim in retrieval.ts.
 */
const MAX_SUMMARY_SOURCE_CHARS = 20000;

/** How the two roles are named to the summarizer. The model never sees "assistant". */
const ROLE_LABELS: Record<ChatMessage["role"], string> = {
  user: "Student",
  assistant: "Companion",
  system: "Note",
};

/**
 * What a conversation needs before this turn's prompt is built.
 *
 * `verbatimCount` messages are replayed word for word; `foldCount` messages, starting where
 * the existing summary stops, are folded into the summary first. `foldCount` is zero on most
 * turns — the batch exists so that the upstream call happens once every several exchanges
 * rather than on every turn past the window, which would cost more than it saves.
 */
export interface CompactionPlan {
  verbatimCount: number;
  foldCount: number;
}

/**
 * Decide, from two numbers, how this turn's prompt is shaped.
 *
 * The important property is not the size of the prompt but the **stability of its front**.
 * The obvious implementation — always replay the newest N messages — bounds the prompt just
 * as well and is much worse, because the window then slides forward by two messages on every
 * single turn. The prompt's prefix changes immediately after the static system prompt, and
 * since that prompt is on its own below OpenAI's 1024-token caching minimum, *nothing is ever
 * cacheable*: every turn pays full price for a prefix it has sent a dozen times. This was
 * measured, not reasoned about — the first version of this feature slid the window and
 * reported `cachedPromptTokens: 0` on every turn of a seven-turn conversation.
 *
 * So the whole unsummarized tail is replayed instead, and it only ever grows by appending.
 * The prefix is then stable between summarizations and the discount applies; a summarization
 * rewrites it and costs one cache miss, roughly every `summaryBatch` messages. The tail stays
 * bounded because a fold takes it straight back down to `verbatimMessages`, so the prompt is
 * never longer than `verbatimMessages + summaryBatch - 1` messages.
 */
export function planCompaction(totalMessages: number, summarizedCount: number): CompactionPlan {
  const { verbatimMessages, summaryBatch } = config.history;

  // Clamped rather than trusted: a boundary ahead of the transcript would mean the summary
  // claims to cover messages that do not exist, and a negative tail would silently send the
  // model nothing at all.
  const unsummarized = Math.max(totalMessages - Math.max(summarizedCount, 0), 0);
  const overflow = unsummarized - verbatimMessages;
  const foldCount = overflow >= summaryBatch ? overflow : 0;

  // What is left once this turn's fold lands. When nothing folds, that is the whole tail;
  // when something does, it is exactly `verbatimMessages`. The second Math.min is the
  // degraded path: if summarization has been failing, the tail keeps growing and the prompt
  // would grow with it, so it is cut to the newest `verbatimMessages` and the messages in
  // between are dropped — which is precisely what every turn did before this feature.
  const verbatimCount = Math.min(unsummarized - foldCount, verbatimMessages + summaryBatch);

  return { verbatimCount, foldCount };
}

export type CompactionOutcome =
  /** Nothing spilled past the verbatim window by a full batch. The common case. */
  | "not_needed"
  /** Older messages were folded into the summary on this turn. */
  | "summarized"
  /** Another turn moved the boundary first; this one's work was discarded. */
  | "raced"
  /** The summarizer or the write failed. The turn proceeds on the verbatim window alone. */
  | "failed";

export interface CompactionResult {
  outcome: CompactionOutcome;
  /** The summary in force for this turn's prompt — the new one when it was written. */
  summary: string | null;
  /** How many messages that summary covers. */
  summarizedMessages: number;
  /** How many were folded in on this turn; zero on every outcome but "summarized". */
  foldedThisTurn: number;
  durationMs: number;
  /** The upstream call this made, if it made one, for the turn's ledger. */
  calls: RawCall[];
}

/**
 * Fold the overflow into the running summary, if there is any, and report what is now in
 * force. Never throws, for the reason in the module note above.
 *
 * Called at the top of a turn and awaited in parallel with Care Pattern retrieval, so on the
 * turns where it does run it usually adds no wall-clock time at all: both are cheap-model
 * calls that have to finish before the reply call can start anyway.
 */
export async function compactHistory(
  conversation: Pick<Conversation, "id" | "summary" | "summarizedMessageCount">,
  plan: CompactionPlan,
): Promise<CompactionResult> {
  const started = Date.now();
  const unchanged = (outcome: CompactionOutcome, calls: RawCall[] = []): CompactionResult => ({
    outcome,
    summary: conversation.summary,
    summarizedMessages: conversation.summarizedMessageCount,
    foldedThisTurn: 0,
    durationMs: Date.now() - started,
    calls,
  });

  if (plan.foldCount <= 0) return unchanged("not_needed");

  let calls: RawCall[] = [];
  try {
    const olderMessages = await loadMessageRange(conversation.id, conversation.summarizedMessageCount, plan.foldCount);
    if (olderMessages.length === 0) return unchanged("not_needed");

    const { summary, model, usage } = await writeSummary(conversation.summary, olderMessages);
    calls = [{ step: "summary", model, usage }];

    const newCount = conversation.summarizedMessageCount + olderMessages.length;
    const saved = await saveSummary(conversation.id, summary, conversation.summarizedMessageCount, newCount);
    // The guard on saveSummary rejected the write because another turn moved the boundary
    // first. Its summary is the current one, so this turn keeps the summary it read and
    // simply replays a few extra messages verbatim — correct, only marginally larger.
    if (!saved) return unchanged("raced", calls);

    return {
      outcome: "summarized",
      summary,
      summarizedMessages: newCount,
      foldedThisTurn: olderMessages.length,
      durationMs: Date.now() - started,
      calls,
    };
  } catch {
    // Swallowed on purpose — the caller logs the outcome and answers from the verbatim
    // window, which is what every turn did before this feature existed. The underlying
    // error is already logged by whichever layer produced it.
    return unchanged("failed", calls);
  }
}

interface SummaryDraft {
  summary: string;
  model: string;
  usage: RawCall["usage"];
}

/**
 * Ask the cheap model for an updated summary covering the old one plus the new messages.
 *
 * The previous summary is handed over as material rather than as an assistant turn: it is
 * the summarizer's own earlier output, and presenting it as conversation would invite the
 * model to continue it instead of replacing it.
 */
async function writeSummary(existingSummary: string | null, messages: ChatMessage[]): Promise<SummaryDraft> {
  const transcript = messages.map((m) => `${ROLE_LABELS[m.role]}: ${m.content}`).join("\n\n");
  const trimmed =
    transcript.length > MAX_SUMMARY_SOURCE_CHARS ? transcript.slice(-MAX_SUMMARY_SOURCE_CHARS) : transcript;

  const previous = existingSummary?.trim();
  const source = [
    previous ? `[Summary so far]\n${previous}` : "[Summary so far]\n(none — this is the first summary)",
    `[Messages to fold into it]\n${trimmed}`,
  ].join("\n\n");

  const { reply, model, usage } = await createChatCompletion({
    model: config.openai.utilityModel,
    maxTokens: config.openai.maxSummaryTokens,
    // Deterministic, like the match-query normalizer: a summary that reworded itself on
    // every rerun would make a conversation's behavior irreproducible for no benefit.
    temperature: 0,
    messages: [
      { role: "system", content: SUMMARIZE_PROMPT },
      { role: "user", content: source },
    ],
  });

  const summary = reply.trim();
  if (!summary) {
    // Storing an empty summary would move the boundary past messages that nothing now
    // describes, permanently losing them from the prompt. Better to try again next turn.
    throw new Error(`summarizer returned nothing (model=${model})`);
  }
  return { summary, model, usage };
}
