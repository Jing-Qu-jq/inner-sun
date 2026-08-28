import OpenAI, { APIError, APIConnectionTimeoutError, APIConnectionError } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatTokenUsage } from "@innersun/shared";
import { config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * The one place in InnerSun that talks to OpenAI (Feature 4).
 *
 * Everything upstream goes through here so that the API key, the model choice,
 * the token cap and the timeout are set in a single place, and so that upstream
 * failures are translated into our own error shape before they reach a route.
 * The browser never calls OpenAI directly — that is the whole point of this
 * service (see docs/PLAN.md Features 4 and 5).
 */

let client: OpenAI | undefined;

/**
 * Built on first use rather than at import time: the server should still boot
 * and serve /health when the key is missing, and validateConfig() is what
 * reports that clearly at startup.
 */
export function getClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw new AppError(503, "ai_not_configured", "The assistant is not configured right now.");
  }
  client ??= new OpenAI({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
    timeout: config.openai.timeoutMs,
    maxRetries: 2,
  });
  return client;
}

/**
 * Token counts for one call, so cost can be tracked (Feature 8).
 *
 * The same shape the inspector and `messages.usage` carry, imported rather than redeclared
 * so a field cannot be added in one place and quietly missing in the other.
 */
export type TokenUsage = ChatTokenUsage;

export interface ChatCompletionResult {
  reply: string;
  model: string;
  usage: TokenUsage;
}

export interface ChatCompletionOptions {
  messages: ChatCompletionMessageParam[];
  /** Defaults to the configured reply model; utility calls pass the cheap one. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Routing hint for OpenAI's prompt cache (Feature 8 AC 4).
   *
   * Caching is automatic, but a cache lives on the machine that served the request, and
   * without a key OpenAI routes by a hash of the prompt's opening tokens — which is the same
   * hash for every InnerSun turn, so every conversation competes for one machine and hit
   * rates fall off as traffic grows. Passing the conversation id sends that conversation's
   * turns to the same place. Honest note: at one conversation at a time it made no measurable
   * difference here — a live run with it and a live run without it both reported zero cached
   * tokens, because the prefix was too young to be cached either way (see docs/PLAN.md
   * Feature 8). It is sent because the routing problem it solves is real at the request rates
   * this product is aiming for, and because it costs nothing.
   *
   * It is an opaque routing string to OpenAI, not content — but a conversation id is still
   * ours, not the student's, and nothing derived from what they wrote goes in it.
   */
  cacheKey?: string;
}

/**
 * Ask OpenAI for a chat completion and return just the text plus usage.
 *
 * Throws AppError for anything a client should see: upstream problems become a
 * 502 (or 504 on timeout) with a generic message, never the upstream text — an
 * OpenAI error body can echo request content or reveal account details.
 *
 * `max_tokens` is always sent (Feature 8 AC 4). It is a cost control before it is a quality
 * one: a model that decides to write an essay is billed for the essay. Callers either pass
 * their own cap — the match-query normalizer asks for 120 tokens, the summarizer for a few
 * hundred — or inherit the reply cap from configuration. No path through here omits it.
 */
export async function createChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const model = options.model ?? config.openai.replyModel;

  let completion;
  try {
    completion = await getClient().chat.completions.create({
      model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? config.openai.maxReplyTokens,
      temperature: options.temperature ?? 0.7,
      ...(options.cacheKey ? { prompt_cache_key: options.cacheKey } : {}),
    });
  } catch (err) {
    throw toAppError(err);
  }

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    // A completion with no text (an empty choices array, or a content filter
    // stop) is an upstream failure as far as the caller is concerned.
    throw new AppError(502, "upstream_empty", "The assistant could not produce a reply. Please try again.", {
      cause: new Error(`empty completion from ${model}; finish_reason=${completion.choices[0]?.finish_reason}`),
    });
  }

  return {
    reply,
    model: completion.model,
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      // How much of the prompt OpenAI served from its cache. Automatic caching applies to
      // the longest common prefix of a prompt once that prefix passes 1024 tokens, which is
      // why the static system prompt goes first and everything that varies per turn goes
      // last (see prompt.ts). This counter is the only way to tell whether that ordering is
      // actually paying off — a prompt assembled in the wrong order still works perfectly,
      // it just costs twice as much and says nothing about it.
      cachedPromptTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    },
  };
}

/**
 * Map an OpenAI SDK error to a client-safe AppError, preserving the original as
 * `cause` so the full detail still reaches the server log.
 */
export function toAppError(err: unknown): AppError {
  const generic = "The assistant is temporarily unavailable. Please try again in a moment.";

  if (err instanceof APIConnectionTimeoutError) {
    return new AppError(504, "upstream_timeout", "The assistant took too long to respond. Please try again.", {
      cause: err,
    });
  }
  if (err instanceof APIConnectionError) {
    return new AppError(502, "upstream_unreachable", generic, { cause: err });
  }
  if (err instanceof APIError) {
    // 401/403 mean *our* key is wrong — a server misconfiguration, not the
    // caller's fault, so it must not surface as a 4xx blaming the client.
    if (err.status === 429) {
      // OpenAI returns 429 both for a momentary rate limit and for an account
      // that is out of credit, which are opposite situations: one clears by
      // itself, the other never does. Only `insufficient_quota` distinguishes
      // them, so telling the two apart keeps "try again shortly" honest and
      // makes the billing case obvious in the log instead of looking like load.
      if (err.code === "insufficient_quota") {
        return new AppError(503, "upstream_quota_exhausted", "The assistant is unavailable right now.", {
          cause: err,
        });
      }
      return new AppError(503, "upstream_rate_limited", "The assistant is busy right now. Please try again shortly.", {
        cause: err,
      });
    }
    return new AppError(502, "upstream_error", generic, { cause: err });
  }
  if (err instanceof AppError) return err;

  return new AppError(502, "upstream_error", generic, { cause: err });
}
