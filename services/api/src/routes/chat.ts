import type { FastifyInstance } from "fastify";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MAX_MESSAGE_LENGTH,
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

/**
 * POST /chat — the orchestrator endpoint (Features 4 and 5).
 *
 * The browser sends a message here instead of to api.openai.com, so the API key
 * stays in this process. History is threaded through PostgreSQL as of Feature 5.
 * The interesting parts arrive later — Care Pattern retrieval in Feature 7,
 * prompt assembly and cost controls in Feature 8, crisis screening in Feature 9.
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
const chatResponseSchema = {
  type: "object",
  required: ["conversationId", "reply", "locale"],
  additionalProperties: false,
  properties: {
    conversationId: { type: "string" },
    reply: { type: "string" },
    locale: { type: "string", enum: [...LOCALES] },
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

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: buildSystemPrompt({ locale: conversation.locale }) },
        ...[...history, userMessage].map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
      ];

      const started = Date.now();
      const completion = await createChatCompletion({ messages, model: config.openai.replyModel });

      // Structured, message-content-free: this is a mental-health product, so
      // the log records the shape of the exchange, never what was said.
      request.log.info(
        {
          conversationId: conversation.id,
          locale: conversation.locale,
          model: completion.model,
          turns: history.length + 1,
          usage: completion.usage,
          durationMs: Date.now() - started,
        },
        "chat completion",
      );

      await appendMessage(conversation.id, { role: "assistant", content: completion.reply });

      return { conversationId: conversation.id, reply: completion.reply, locale: conversation.locale };
    },
  );
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
