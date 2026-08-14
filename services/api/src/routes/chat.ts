import type { FastifyInstance } from "fastify";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MAX_MESSAGE_LENGTH,
  type ChatRequest,
  type ChatResponse,
} from "@innersun/shared";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { appendMessage, createConversation, getConversation, type Conversation } from "../conversations.js";
import { AppError } from "../errors.js";
import { createChatCompletion } from "../openai.js";
import { buildSystemPrompt } from "../prompt.js";

/**
 * POST /chat — the orchestrator endpoint (Feature 4).
 *
 * The browser sends a message here instead of to api.openai.com, so the API key
 * stays in this process. For now the route is a straight pass-through with
 * history; the interesting parts arrive later — Care Pattern retrieval in
 * Feature 7, prompt assembly and cost controls in Feature 8, crisis screening
 * in Feature 9.
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

      const conversation = resolveConversation(conversationId, requestedLocale ?? DEFAULT_LOCALE);
      // An existing conversation keeps its locale unless this request asks to
      // change it, so a mid-conversation language switch takes effect.
      if (requestedLocale) conversation.locale = requestedLocale;

      appendMessage(conversation, { role: "user", content: message });

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: buildSystemPrompt({ locale: conversation.locale }) },
        ...conversation.messages.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
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
          turns: conversation.messages.length,
          usage: completion.usage,
          durationMs: Date.now() - started,
        },
        "chat completion",
      );

      appendMessage(conversation, { role: "assistant", content: completion.reply });

      return { conversationId: conversation.id, reply: completion.reply, locale: conversation.locale };
    },
  );
}

/**
 * Continue the named conversation, or start one when no id was sent.
 *
 * An id we do not recognise is a 404 rather than a silently adopted new
 * conversation: the client should learn its id is stale (every id is, after a
 * restart, while history lives in memory) and start over with a fresh one.
 */
function resolveConversation(conversationId: string | undefined, locale: ChatRequest["locale"]): Conversation {
  if (!conversationId) return createConversation(locale ?? DEFAULT_LOCALE);

  const existing = getConversation(conversationId);
  if (!existing) {
    throw new AppError(
      404,
      "conversation_not_found",
      "That conversation is no longer available. Start a new one by sending a message without a conversation id.",
    );
  }
  return existing;
}
