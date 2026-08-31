import type { FastifyInstance } from "fastify";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MAX_MESSAGE_LENGTH,
  type ChatDebug,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
} from "@innersun/shared";
import { config } from "../config.js";
import {
  appendMessage,
  conversationCostUsd,
  countMessages,
  createConversation,
  getConversation,
  loadHistory,
  updateConversationLocale,
  type Conversation,
} from "../conversations.js";
import { crisisFallbackReply, crisisResources } from "../crisis-resources.js";
import { AppError } from "../errors.js";
import { createChatCompletion } from "../openai.js";
import { buildChatMessages } from "../prompt.js";
import { isInspector, wantsComparison } from "../inspector.js";
import {
  formatCarePatternGuidance,
  retrieveCarePatterns,
  RETRIEVAL_SKIPPED,
  type RetrievalResult,
} from "../retrieval.js";
import { hasObviousCrisis, screenForCrisis, type SafetyScreenResult } from "../safety.js";
import { recordSafetyEvent } from "../safety-events.js";
import { compactHistory, planCompaction, type CompactionResult } from "../summarize.js";
import { TurnLedger } from "../usage.js";

/**
 * POST /chat — the orchestrator endpoint (Features 4 and 5).
 *
 * The browser sends a message here instead of to api.openai.com, so the API key stays in
 * this process. History is threaded through PostgreSQL as of Feature 5; since Feature 7
 * every turn is matched against the Care Pattern library so the reply is steered by
 * researcher-authored guidance; since Feature 8 the prompt is assembled for cost as
 * well as for quality — the static half first so OpenAI can cache it, the older half of a
 * long conversation replaced by a running summary, and every upstream call the turn made
 * priced and recorded; and since Feature 9 every message is screened for crisis signals
 * before the reply is written, which is the one decision here that outranks all the others.
 *
 * A turn's shape, in order:
 *
 *   1. Resolve the conversation and work out how much of it to replay verbatim.
 *   2. Persist the student's message — before anything upstream, so it is never lost.
 *   3. In parallel, on the cheap model: compact the history if it has overflowed, screen the
 *      message for crisis signals, and match the conversation to Care Patterns.
 *   4. Assemble the prompt and make the one expensive call — to the crisis directive instead
 *      of the ordinary one when screening fired, with the retrieved guidance dropped.
 *   5. Record what it all cost, on the assistant message and in the log.
 *
 * **Why screening runs alongside retrieval rather than strictly in front of it.** Feature 9
 * AC 6 describes screening as running before retrieval and overriding it, and what has to be
 * true is the *override*, which it is: on a crisis turn the matched guidance is dropped, the
 * booking nudge is suppressed and a different directive is used. Ordering the two calls
 * serially would have added the classifier's latency to the front of every ordinary turn to
 * buy nothing on any of them. Instead the free half of screening — the phrase lexicon — does
 * run first, and when it settles the turn, retrieval is never dispatched at all.
 */

/**
 * Request validation, expressed as JSON Schema because that is what Fastify
 * validates with natively. It must stay in step with ChatRequest in
 * @innersun/shared — the locale list and the length cap are imported from there
 * rather than copied so the parts that actually change are single-sourced.
 */
const chatBodySchema = {
  type: "object",
  required: ["message"],
  additionalProperties: false,
  properties: {
    message: { type: "string", minLength: 1, maxLength: MAX_MESSAGE_LENGTH },
    conversationId: { type: "string", format: "uuid" },
    locale: { type: "string", enum: [...LOCALES] },
  },
} as const;

/**
 * Response schema. Fastify serializes strictly against this, which means a
 * field we never declared cannot leak out of the endpoint even if some future
 * handler puts one on the object.
 */
const usageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    promptTokens: { type: "number" },
    cachedPromptTokens: { type: "number" },
    completionTokens: { type: "number" },
    totalTokens: { type: "number" },
  },
} as const;

/**
 * Retrieval internals, returned only to a privileged viewer (Feature 22).
 *
 * Declared here because Fastify serializes strictly against this schema — which is the
 * property that keeps the field from leaking. An undeclared `debug` could not be returned
 * at all, and a declared-but-absent one is simply not serialized, so an ordinary visitor's
 * response is byte-identical whether or not the inspector exists on this instance.
 */
const chatDebugSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Crisis screening (Feature 9). First, because it outranks everything below it.
    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        crisis: { type: "boolean" },
        source: { type: "string" },
        category: { type: "string" },
        rules: { type: "array", items: { type: "string" } },
        classifier: { type: "string" },
        overrodeRetrieval: { type: "boolean" },
        durationMs: { type: "number" },
      },
    },
    outcome: { type: "string" },
    gap: { type: "boolean" },
    floor: { type: "number" },
    matchQuery: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          score: { type: "number" },
          applied: { type: "boolean" },
        },
      },
    },
    guidance: { type: "string" },
    retrievalMs: { type: "number" },
    usage: usageSchema,
    model: { type: "string" },
    // Prompt assembly and cost accounting (Feature 8).
    prompt: {
      type: "object",
      additionalProperties: false,
      properties: {
        verbatimMessages: { type: "number" },
        summarizedMessages: { type: "number" },
        summary: { type: "string" },
        summarizedThisTurn: { type: "boolean" },
        maxReplyTokens: { type: "number" },
      },
    },
    calls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          step: { type: "string" },
          model: { type: "string" },
          promptTokens: { type: "number" },
          cachedPromptTokens: { type: "number" },
          completionTokens: { type: "number" },
          costUsd: { type: "number" },
        },
      },
    },
    turnCostUsd: { type: "number" },
    conversationCostUsd: { type: "number" },
    replyWithoutGuidance: { type: "string" },
    usageWithoutGuidance: usageSchema,
  },
} as const;

/**
 * Crisis resources (Feature 9). Unlike `debug`, this is for the student rather than for a
 * privileged viewer — it is what AC 2 requires the app to surface — so it is declared with
 * the same strictness and simply absent on every ordinary turn.
 */
const chatCrisisSchema = {
  type: "object",
  required: ["category", "resources"],
  additionalProperties: false,
  properties: {
    category: { type: "string" },
    resources: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "contact"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          contact: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const chatResponseSchema = {
  type: "object",
  required: ["conversationId", "reply", "locale"],
  additionalProperties: false,
  properties: {
    conversationId: { type: "string" },
    reply: { type: "string" },
    locale: { type: "string", enum: [...LOCALES] },
    crisis: chatCrisisSchema,
    debug: chatDebugSchema,
  },
} as const;

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /inspect — does this token work? (Feature 22, amended.)
   *
   * The inspector is checked on POST /chat and nowhere else, so unlocking the bar in the browser
   * used to prove nothing: a wrong token produced an ordinary reply and an empty panel, which is
   * indistinguishable from a working inspector that had nothing to say. This gives the unlock
   * button something to ask.
   *
   * The three answers are deliberately distinct, because they need different fixes:
   *
   *   204  the token works.
   *   401  the token does not match this instance.
   *   404  INSPECTOR_TOKEN is unset here, so the inspector does not exist — the same answer an
   *        unknown route gives, which is what keeps "unset means the feature does not exist"
   *        true for this endpoint as well as for the debug payload.
   *
   * It is not a new oracle. Anyone could already probe a token by sending chat messages; the only
   * thing that changes is that probing now costs *us* nothing instead of an OpenAI call per guess.
   * Rate limited on the same budget as the admin login, for the same reason.
   */
  app.get(
    "/inspect",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!config.inspectorToken) {
        return reply.status(404).send({ error: { code: "not_found", message: "Route not found." } });
      }
      if (!isInspector(request)) {
        return reply.status(401).send({
          error: { code: "inspector_token_invalid", message: "That token was not accepted." },
        });
      }
      return reply.status(204).send();
    },
  );

  app.post<{ Body: ChatRequest; Reply: ChatResponse }>(
    "/chat",
    { schema: { body: chatBodySchema, response: { 200: chatResponseSchema } } },
    async (request): Promise<ChatResponse> => {
      const { message, conversationId, locale: requestedLocale } = request.body;
      const ledger = new TurnLedger();

      const conversation = await resolveConversation(conversationId, requestedLocale ?? DEFAULT_LOCALE);
      // An existing conversation keeps its locale unless this request asks to
      // change it, so a mid-conversation language switch takes effect.
      if (requestedLocale && requestedLocale !== conversation.locale) {
        await updateConversationLocale(conversation.id, requestedLocale);
        conversation.locale = requestedLocale;
      }

      // How much of this conversation goes to the model word for word, and whether enough
      // has spilled past that window to be worth summarizing (Feature 8). Counted before
      // this turn's message is stored, so `history` and `message` stay disjoint.
      const plan = planCompaction(await countMessages(conversation.id), conversation.summarizedMessageCount);
      const history = await loadHistory(conversation.id, plan.verbatimCount);
      const userMessage: ChatMessage = { role: "user", content: message };

      // Persisted before the upstream call, so a message is never lost to an
      // OpenAI failure: the student's turn is on record even when no reply is. The id comes
      // back so a crisis trigger can be attached to this exact message (Feature 9 AC 5).
      const userMessageId = await appendMessage(conversation.id, userMessage);

      // The free half of crisis screening, before anything is dispatched (Feature 9). When
      // the phrase lexicon settles the turn there is no point retrieving guidance that is
      // about to be discarded — and a student who has just written an unambiguous disclosure
      // is the last person who should wait two upstream calls for it.
      const obviousCrisis = hasObviousCrisis(message);

      // The cheap-model steps, run together because all of them must finish before the reply
      // call can start and none depends on another. On the turns where a summarization
      // happens it therefore costs almost no extra wall-clock time.
      //
      // Retrieval is handed the summary as it stood at the top of the turn, not the one
      // compaction is writing right now. That is deliberate and harmless: the match query
      // reads the summary plus the student's last few messages, and the messages being
      // folded in this turn are twenty messages old — far outside that window either way.
      const [compaction, match, screen] = await Promise.all([
        compactHistory(conversation, plan),
        obviousCrisis
          ? Promise.resolve(RETRIEVAL_SKIPPED)
          : retrieveCarePatterns({ history, message, summary: conversation.summary }),
        screenForCrisis({ history, message }),
      ]);
      ledger.recordAll(compaction.calls);
      ledger.recordAll(match.calls);
      ledger.recordAll(screen.calls);

      // Crisis handling takes priority over Care-Pattern matching (Feature 9 AC 3). The
      // guidance is DROPPED rather than blended: a student disclosing self-harm does not
      // need study strategies alongside a hotline, and the crisis directive replaces the
      // ordinary one entirely. `overrodeRetrieval` records that this happened, because the
      // turn is otherwise indistinguishable from one where nothing matched.
      const overrodeRetrieval = screen.crisis && match.applied.length > 0;
      const guidance = screen.crisis ? "" : formatCarePatternGuidance(match.applied, conversation.locale);
      const promptOptions = {
        locale: conversation.locale,
        summary: compaction.summary,
        history,
        message,
      };
      const messages = buildChatMessages({
        ...promptOptions,
        carePatternStrategies: guidance,
        crisis: screen.crisis,
      });

      // Screening is logged on every turn, positives and negatives alike (Feature 9 AC 5):
      // the negatives are what makes recall measurable later, and they cost a log line. Rule
      // IDENTIFIERS only — never the phrase that matched, never the message. A classifier
      // that failed or answered outside its label set is a degraded safety layer rather than
      // an ordinary turn, so it is logged as a warning.
      const screeningLog = {
        conversationId: conversation.id,
        crisis: screen.crisis,
        source: screen.source,
        category: screen.category,
        rules: screen.rules,
        classifier: screen.classifier,
        overrodeRetrieval,
        durationMs: screen.durationMs,
      };
      if (screen.classifier === "failed" || screen.classifier === "unparsed") {
        request.log.warn(screeningLog, "crisis screening degraded");
      } else {
        request.log.info(screeningLog, "crisis screening");
      }

      // Started before the reply and awaited after it: the trigger is the thing that has to
      // survive, and a student in crisis should not wait on our bookkeeping to reach them.
      // It never rejects — see safety-events.ts.
      const eventRecorded = screen.crisis
        ? recordSafetyEvent(
            {
              conversationId: conversation.id,
              messageId: userMessageId,
              locale: conversation.locale,
              screen,
              model: screen.calls[0]?.model,
            },
            request.log,
          )
        : Promise.resolve();

      // Pattern titles are researcher-authored, never student words, so they are safe to
      // log — and they are what makes a wrong match visible at all. `gap: true` marks a
      // real situation the library had no answer for, which is the signal that says which
      // pattern to author next (Feature 19 collects these).
      request.log.info(
        {
          conversationId: conversation.id,
          outcome: match.outcome,
          gap: match.gap,
          floor: config.retrieval.relevanceFloor,
          // `applied` below is what RETRIEVAL concluded, which on a crisis turn is not what
          // the reply was written with — the guidance was dropped. Feature 23 AC 6 makes the
          // same distinction deliberately: the measurement and the decision are recorded
          // separately, so this flag is what keeps the line from being read as the decision.
          overriddenByCrisis: overrodeRetrieval,
          applied: match.applied.map((m) => ({ id: m.id, title: m.title, score: Number(m.similarity.toFixed(4)) })),
          candidates: match.candidates.map((m) => ({ title: m.title, score: Number(m.similarity.toFixed(4)) })),
          durationMs: match.durationMs,
        },
        "care pattern match",
      );

      // Message-content-free, like every other log line here: the counts say what happened
      // to the prompt, never what was in it. A summary is derived from a student's words and
      // is treated as such.
      request.log.info(
        {
          conversationId: conversation.id,
          outcome: compaction.outcome,
          verbatimMessages: history.length + 1,
          summarizedMessages: compaction.summarizedMessages,
          foldedThisTurn: compaction.foldedThisTurn,
          durationMs: compaction.durationMs,
        },
        "history compaction",
      );

      // The inspector (Feature 22). `inspect` gates the payload; `compare` additionally asks
      // for the same turn answered with the guidance withheld, so the two can be shown side
      // by side. The comparison is skipped when no guidance was applied — with nothing to
      // withhold, two replies would differ only by sampling noise and demonstrate nothing.
      const inspect = isInspector(request);
      const compare = inspect && wantsComparison(request) && guidance !== "";

      const started = Date.now();
      let completion: Awaited<ReturnType<typeof createChatCompletion>> | undefined;
      let unguided: Awaited<ReturnType<typeof createChatCompletion>> | undefined;
      try {
        [completion, unguided] = await Promise.all([
          createChatCompletion({ messages, model: config.openai.replyModel, cacheKey: conversation.id }),
          // In parallel: it is a second call on the same turn, and running it after the first
          // would make an inspected turn twice as slow as the one being demonstrated.
          compare
            ? createChatCompletion({
                messages: buildChatMessages(promptOptions),
                model: config.openai.replyModel,
                cacheKey: conversation.id,
              })
            : Promise.resolve(undefined),
        ]);
      } catch (err) {
        // On an ordinary turn an upstream failure is an error the student is told about, and
        // that has been right since Feature 4. On a CRISIS turn it is not: the one moment
        // this product must not answer with "something went wrong, please try again" is the
        // moment someone has just disclosed that they are in danger. So the turn degrades to
        // fixed text plus the resource list, which is the half that actually had to arrive.
        if (!screen.crisis) throw err;
        request.log.error(
          { err, conversationId: conversation.id },
          "crisis reply failed upstream — falling back to the fixed crisis message",
        );
      }

      const reply = completion ? completion.reply : crisisFallbackReply(conversation.locale);
      if (completion) ledger.record("reply", completion.model, completion.usage);
      // Counted too, even though no student ever sees it. It is a real call on a real bill,
      // and the inspector's own switch says it doubles the cost of a turn — a cost figure
      // that quietly excluded it would make that warning look untrue.
      if (unguided) ledger.record("reply-no-guidance", unguided.model, unguided.usage);

      const turn = ledger.toRecord();

      // Structured, message-content-free: this is a mental-health product, so
      // the log records the shape of the exchange, never what was said. Per-call token
      // counts are Feature 8 AC 5 — the unit cost is watched from here.
      request.log.info(
        {
          conversationId: conversation.id,
          locale: conversation.locale,
          model: completion?.model ?? "(crisis fallback)",
          turns: history.length + 1,
          crisis: screen.crisis,
          carePatterns: match.applied.length,
          calls: turn.calls,
          usage: turn.totals,
          turnCostUsd: turn.costUsd,
          durationMs: Date.now() - started,
        },
        "chat completion",
      );

      // Only the real reply is recorded — and on a degraded crisis turn that is the fallback
      // text, because the transcript has to say what the student actually saw. The comparison
      // reply was never shown to anyone and must not become part of the transcript that later
      // features summarize, analyze and export. What the turn cost rides along with it
      // (migration 0005).
      await appendMessage(conversation.id, { role: "assistant", content: reply }, turn);
      await eventRecorded;

      const response: ChatResponse = {
        conversationId: conversation.id,
        reply,
        locale: conversation.locale,
      };
      // The resources themselves (Feature 9 AC 2) — for every visitor, not only an inspector.
      // Attached by the server because the server is what decided; a client asked to
      // re-derive this from the reply text would be guessing.
      if (screen.crisis) {
        response.crisis = { category: screen.category, resources: crisisResources(conversation.locale) };
      }
      if (inspect) {
        // Read after the turn is stored, so the figure includes this turn. One aggregate
        // over one conversation's own rows, and only for a privileged viewer.
        response.debug = buildDebug({
          screen,
          overrodeRetrieval,
          match,
          compaction,
          guidance,
          completion,
          unguided,
          turn,
          verbatimMessages: history.length + 1,
          conversationCostUsd: await conversationCostUsd(conversation.id),
        });
      }
      return response;
    },
  );
}

/**
 * Assemble what the inspector shows (Features 22, 8 and 9).
 *
 * Nothing here is computed for the occasion — every field is a fact the turn already
 * produced. That is deliberate: an inspector that changed how a turn ran would be showing
 * a different turn than the one the student got.
 *
 * Taken as one object rather than eight positional arguments because the list stopped being
 * readable at about five, and every feature that adds a decision to a turn adds one here.
 */
interface DebugInput {
  screen: SafetyScreenResult;
  overrodeRetrieval: boolean;
  match: RetrievalResult;
  compaction: CompactionResult;
  guidance: string;
  /** Undefined on a crisis turn whose reply call failed and fell back to fixed text. */
  completion: Awaited<ReturnType<typeof createChatCompletion>> | undefined;
  unguided: Awaited<ReturnType<typeof createChatCompletion>> | undefined;
  turn: ReturnType<TurnLedger["toRecord"]>;
  verbatimMessages: number;
  conversationCostUsd: number;
}

function buildDebug({
  screen,
  overrodeRetrieval,
  match,
  compaction,
  guidance,
  completion,
  unguided,
  turn,
  verbatimMessages,
  conversationCostUsd: conversationCost,
}: DebugInput): ChatDebug {
  // Empty on a crisis turn even when patterns cleared the floor, because on that turn
  // nothing WAS applied — the guidance was dropped. Reporting them as applied would make
  // the panel assert the opposite of what happened, and it is `overrodeRetrieval` above
  // that records the fact they scored well enough to have been used.
  const appliedIds = new Set(screen.crisis ? [] : match.applied.map((m) => m.id));

  return {
    // First, because it is the decision that outranks the rest: when `crisis` is true the
    // candidates below were computed and then discarded, or never computed at all.
    safety: {
      crisis: screen.crisis,
      source: screen.source,
      category: screen.category,
      rules: screen.rules,
      classifier: screen.classifier,
      overrodeRetrieval,
      durationMs: screen.durationMs,
    },
    outcome: match.outcome,
    gap: match.gap,
    floor: config.retrieval.relevanceFloor,
    ...(match.query ? { matchQuery: match.query } : {}),
    candidates: match.candidates.map((c) => ({
      id: c.id,
      title: c.title,
      score: Number(c.similarity.toFixed(4)),
      applied: appliedIds.has(c.id),
    })),
    guidance,
    retrievalMs: match.durationMs,
    ...(completion ? { usage: completion.usage, model: completion.model } : {}),
    prompt: {
      verbatimMessages,
      summarizedMessages: compaction.summarizedMessages,
      ...(compaction.summary ? { summary: compaction.summary } : {}),
      summarizedThisTurn: compaction.outcome === "summarized",
      maxReplyTokens: config.openai.maxReplyTokens,
    },
    calls: turn.calls,
    turnCostUsd: turn.costUsd,
    conversationCostUsd: Number(conversationCost.toFixed(6)),
    ...(unguided ? { replyWithoutGuidance: unguided.reply, usageWithoutGuidance: unguided.usage } : {}),
  };
}

/**
 * Continue the named conversation, or start one when no id was sent.
 *
 * An id we do not recognise is a 404 rather than a silently adopted new
 * conversation: the client should learn its id is stale and start over with a
 * fresh one. Since Feature 5 this is rare — ids survive restarts now — but it
 * still happens after a database reset, and the web client handles it by
 * dropping the id and retrying once.
 */
async function resolveConversation(
  conversationId: string | undefined,
  locale: ChatRequest["locale"],
): Promise<Conversation> {
  if (!conversationId) return createConversation(locale ?? DEFAULT_LOCALE);

  const existing = await getConversation(conversationId);
  if (!existing) {
    throw new AppError(
      404,
      "conversation_not_found",
      "That conversation is no longer available. Start a new one by sending a message without a conversation id.",
    );
  }
  return existing;
}
