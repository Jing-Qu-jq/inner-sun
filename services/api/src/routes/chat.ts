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
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "../config.js";
import {
  HISTORY_WINDOW,
  appendMessage,
  createConversation,
  getConversation,
  loadHistory,
  updateConversationLocale,
  type Conversation,
} from "../conversations.js";
import { AppError } from "../errors.js";
import { createChatCompletion } from "../openai.js";
import { buildSystemPrompt } from "../prompt.js";
import { isInspector, wantsComparison } from "../inspector.js";
import { formatCarePatternGuidance, retrieveCarePatterns, type RetrievalResult } from "../retrieval.js";

/**
 * POST /chat — the orchestrator endpoint (Features 4 and 5).
 *
 * The browser sends a message here instead of to api.openai.com, so the API key
 * stays in this process. History is threaded through PostgreSQL as of Feature 5,
 * and since Feature 7 every turn is matched against the Care Pattern library so
 * the reply is steered by researcher-authored guidance rather than by the model's
 * generic instincts. Still to come: prompt assembly and cost controls in Feature 8,
 * crisis screening in Feature 9.
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
  app.post<{ Body: ChatRequest; Reply: ChatResponse }>(
    "/chat",
    { schema: { body: chatBodySchema, response: { 200: chatResponseSchema } } },
    async (request): Promise<ChatResponse> => {
      const { message, conversationId, locale: requestedLocale } = request.body;

      const conversation = await resolveConversation(conversationId, requestedLocale ?? DEFAULT_LOCALE);
      // An existing conversation keeps its locale unless this request asks to
      // change it, so a mid-conversation language switch takes effect.
      if (requestedLocale && requestedLocale !== conversation.locale) {
        await updateConversationLocale(conversation.id, requestedLocale);
        conversation.locale = requestedLocale;
      }

      // Earlier turns, then this one. Loading one short of the window leaves
      // room for the new message, so at most HISTORY_WINDOW turns go upstream.
      const history = await loadHistory(conversation.id, HISTORY_WINDOW - 1);
      const userMessage: ChatMessage = { role: "user", content: message };

      // Persisted before the upstream call, so a message is never lost to an
      // OpenAI failure: the student's turn is on record even when no reply is.
      await appendMessage(conversation.id, userMessage);

      // Care Pattern retrieval (Feature 7). Runs on every turn, not once per conversation:
      // what a student is dealing with emerges as they talk, so the match sharpens — or
      // switches to a different pattern entirely — as the conversation grows. It costs one
      // cheap completion plus one embedding, a fraction of the reply call it precedes.
      const match = await retrieveCarePatterns({
        history,
        message,
        summary: conversation.summary,
      });

      const guidance = formatCarePatternGuidance(match.applied, conversation.locale);
      const turn = [...history, userMessage].map(
        (m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam,
      );

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: buildSystemPrompt({ locale: conversation.locale, carePatternStrategies: guidance }) },
        ...turn,
      ];

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

      // The inspector (Feature 22). `inspect` gates the payload; `compare` additionally asks
      // for the same turn answered with the guidance withheld, so the two can be shown side
      // by side. The comparison is skipped when no guidance was applied — with nothing to
      // withhold, two replies would differ only by sampling noise and demonstrate nothing.
      const inspect = isInspector(request);
      const compare = inspect && wantsComparison(request) && guidance !== "";

      const started = Date.now();
      const [completion, unguided] = await Promise.all([
        createChatCompletion({ messages, model: config.openai.replyModel }),
        // In parallel: it is a second call on the same turn, and running it after the first
        // would make an inspected turn twice as slow as the one being demonstrated.
        compare
          ? createChatCompletion({
              messages: [
                { role: "system", content: buildSystemPrompt({ locale: conversation.locale }) },
                ...turn,
              ],
              model: config.openai.replyModel,
            })
          : Promise.resolve(undefined),
      ]);

      // Structured, message-content-free: this is a mental-health product, so
      // the log records the shape of the exchange, never what was said.
      request.log.info(
        {
          conversationId: conversation.id,
          locale: conversation.locale,
          model: completion.model,
          turns: history.length + 1,
          carePatterns: match.applied.length,
          usage: completion.usage,
          durationMs: Date.now() - started,
        },
        "chat completion",
      );

      // Only the real reply is recorded. The comparison reply was never shown to a student
      // and must not become part of the transcript that later features summarize, analyze
      // and export.
      await appendMessage(conversation.id, { role: "assistant", content: completion.reply });

      const response: ChatResponse = {
        conversationId: conversation.id,
        reply: completion.reply,
        locale: conversation.locale,
      };
      if (inspect) {
        response.debug = buildDebug(match, guidance, completion, unguided);
      }
      return response;
    },
  );
}

/**
 * Assemble what the inspector shows (Feature 22).
 *
 * Nothing here is computed for the occasion — every field is a fact the turn already
 * produced. That is deliberate: an inspector that changed how a turn ran would be showing
 * a different turn than the one the student got.
 */
function buildDebug(
  match: RetrievalResult,
  guidance: string,
  completion: Awaited<ReturnType<typeof createChatCompletion>>,
  unguided: Awaited<ReturnType<typeof createChatCompletion>> | undefined,
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
