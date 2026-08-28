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
import { AppError } from "../errors.js";
import { createChatCompletion } from "../openai.js";
import { buildChatMessages } from "../prompt.js";
import { isInspector, wantsComparison } from "../inspector.js";
import { formatCarePatternGuidance, retrieveCarePatterns, type RetrievalResult } from "../retrieval.js";
import { compactHistory, planCompaction, type CompactionResult } from "../summarize.js";
import { TurnLedger } from "../usage.js";

/**
 * POST /chat — the orchestrator endpoint (Features 4 and 5).
 *
 * The browser sends a message here instead of to api.openai.com, so the API key stays in
 * this process. History is threaded through PostgreSQL as of Feature 5; since Feature 7
 * every turn is matched against the Care Pattern library so the reply is steered by
 * researcher-authored guidance; and since Feature 8 the prompt is assembled for cost as
 * well as for quality — the static half first so OpenAI can cache it, the older half of a
 * long conversation replaced by a running summary, and every upstream call the turn made
 * priced and recorded. Still to come: crisis screening in Feature 9.
 *
 * A turn's shape, in order:
 *
 *   1. Resolve the conversation and work out how much of it to replay verbatim.
 *   2. Persist the student's message — before anything upstream, so it is never lost.
 *   3. In parallel, on the cheap model: compact the history if it has overflowed, and
 *      match the conversation to Care Patterns.
 *   4. Assemble the prompt and make the one expensive call.
 *   5. Record what it all cost, on the assistant message and in the log.
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

const chatResponseSchema = {
  type: "object",
  required: ["conversationId", "reply", "locale"],
  additionalProperties: false,
  properties: {
    conversationId: { type: "string" },
    reply: { type: "string" },
    locale: { type: "string", enum: [...LOCALES] },
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
      // OpenAI failure: the student's turn is on record even when no reply is.
      await appendMessage(conversation.id, userMessage);

      // The two cheap-model steps, run together because both must finish before the reply
      // call can start and neither depends on the other. On the turns where a summarization
      // happens it therefore costs almost no extra wall-clock time.
      //
      // Retrieval is handed the summary as it stood at the top of the turn, not the one
      // compaction is writing right now. That is deliberate and harmless: the match query
      // reads the summary plus the student's last few messages, and the messages being
      // folded in this turn are twenty messages old — far outside that window either way.
      const [compaction, match] = await Promise.all([
        compactHistory(conversation, plan),
        retrieveCarePatterns({ history, message, summary: conversation.summary }),
      ]);
      ledger.recordAll(compaction.calls);
      ledger.recordAll(match.calls);

      const guidance = formatCarePatternGuidance(match.applied, conversation.locale);
      const promptOptions = {
        locale: conversation.locale,
        summary: compaction.summary,
        history,
        message,
      };
      const messages = buildChatMessages({ ...promptOptions, carePatternStrategies: guidance });

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
      const [completion, unguided] = await Promise.all([
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
      ledger.record("reply", completion.model, completion.usage);
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
          model: completion.model,
          turns: history.length + 1,
          carePatterns: match.applied.length,
          calls: turn.calls,
          usage: turn.totals,
          turnCostUsd: turn.costUsd,
          durationMs: Date.now() - started,
        },
        "chat completion",
      );

      // Only the real reply is recorded. The comparison reply was never shown to a student
      // and must not become part of the transcript that later features summarize, analyze
      // and export. What the turn cost rides along with it (migration 0005).
      await appendMessage(conversation.id, { role: "assistant", content: completion.reply }, turn);

      const response: ChatResponse = {
        conversationId: conversation.id,
        reply: completion.reply,
        locale: conversation.locale,
      };
      if (inspect) {
        // Read after the turn is stored, so the figure includes this turn. One aggregate
        // over one conversation's own rows, and only for a privileged viewer.
        response.debug = buildDebug(match, compaction, guidance, completion, unguided, turn, {
          verbatimMessages: history.length + 1,
          conversationCostUsd: await conversationCostUsd(conversation.id),
        });
      }
      return response;
    },
  );
}

/**
 * Assemble what the inspector shows (Features 22 and 8).
 *
 * Nothing here is computed for the occasion — every field is a fact the turn already
 * produced. That is deliberate: an inspector that changed how a turn ran would be showing
 * a different turn than the one the student got.
 */
function buildDebug(
  match: RetrievalResult,
  compaction: CompactionResult,
  guidance: string,
  completion: Awaited<ReturnType<typeof createChatCompletion>>,
  unguided: Awaited<ReturnType<typeof createChatCompletion>> | undefined,
  turn: ReturnType<TurnLedger["toRecord"]>,
  context: { verbatimMessages: number; conversationCostUsd: number },
): ChatDebug {
  const appliedIds = new Set(match.applied.map((m) => m.id));

  return {
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
    usage: completion.usage,
    model: completion.model,
    prompt: {
      verbatimMessages: context.verbatimMessages,
      summarizedMessages: compaction.summarizedMessages,
      ...(compaction.summary ? { summary: compaction.summary } : {}),
      summarizedThisTurn: compaction.outcome === "summarized",
      maxReplyTokens: config.openai.maxReplyTokens,
    },
    calls: turn.calls,
    turnCostUsd: turn.costUsd,
    conversationCostUsd: Number(context.conversationCostUsd.toFixed(6)),
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
