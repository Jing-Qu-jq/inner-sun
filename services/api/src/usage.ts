import type { ChatDebugCall, ChatTokenUsage } from "@innersun/shared";
import { config } from "./config.js";
import { STATIC_SYSTEM_PROMPT } from "./prompt.js";

/**
 * Token accounting for one turn (Feature 8).
 *
 * A turn is not one model call. It is a cheap call to normalize the match query, an
 * embedding, sometimes a summarization, and then the one expensive call that writes the
 * reply — and the whole point of the model tiering in this feature is that only the last of
 * those runs on `gpt-4o`. A single "tokens used" number would hide that, so every call is
 * recorded separately with the model that served it.
 *
 * The USD figures are estimates for observability, never billing. They come from the list
 * prices below, which live in this repository and drift the moment OpenAI changes theirs;
 * the authoritative number is the one on the invoice. What they are for is watching the
 * ~$0.05-per-conversation unit cost that the plan's economics rest on, from the inspector
 * and from the log, without exporting anything to a dashboard first.
 */

/** USD per 1,000,000 tokens. OpenAI list prices, recorded 2026-08-25. */
interface ModelPrice {
  input: number;
  /** Prompt tokens served from OpenAI's prompt cache. Half price on the 4o family. */
  cachedInput: number;
  output: number;
}

/**
 * Keyed by model-id prefix, because the id that comes back from OpenAI is dated —
 * a request for `gpt-4o` is answered by `gpt-4o-2024-08-06`. Longest prefix wins, so
 * `gpt-4o-mini` is never priced as `gpt-4o`, which would be about seventeen times too much.
 */
const PRICES: Record<string, ModelPrice> = {
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, cachedInput: 0.13, output: 0 },
};

function priceFor(model: string): ModelPrice | undefined {
  let best: ModelPrice | undefined;
  let bestLength = -1;
  for (const [prefix, price] of Object.entries(PRICES)) {
    if (model.startsWith(prefix) && prefix.length > bestLength) {
      best = price;
      bestLength = prefix.length;
    }
  }
  return best;
}

/**
 * Estimated USD for one call.
 *
 * An unknown model prices at zero rather than at a guess. A wrong number that looks
 * plausible is worse than an obviously missing one: the whole reason to show cost here is
 * to notice when it moves, and a fabricated rate would hide exactly that.
 */
export function estimateCostUsd(model: string, usage: ChatTokenUsage): number {
  const price = priceFor(model);
  if (!price) return 0;

  const cached = Math.min(usage.cachedPromptTokens, usage.promptTokens);
  const fresh = usage.promptTokens - cached;

  return (fresh * price.input + cached * price.cachedInput + usage.completionTokens * price.output) / 1_000_000;
}

/** Whether we have a price for this model at all — used to warn once, at startup. */
export function isPricedModel(model: string): boolean {
  return priceFor(model) !== undefined;
}

/**
 * One call as the module that made it reports it: what it was for, which model served it,
 * and the tokens. The pricing is applied when it reaches the ledger.
 */
export interface RawCall {
  step: string;
  model: string;
  usage: ChatTokenUsage;
}

/** An empty usage record, so callers never have to spell out four zeroes. */
export const NO_USAGE: ChatTokenUsage = {
  promptTokens: 0,
  cachedPromptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/**
 * Everything one turn spent, in the order the calls were started.
 *
 * Deliberately a plain accumulator with no I/O of its own: the route logs it, the inspector
 * shows it and `messages.usage` stores it, and none of those should be able to change what
 * a turn does. Steps that never ran simply never get recorded, which is how a skipped
 * retrieval or an absent summarization shows up as an absence rather than as a zero.
 */
export class TurnLedger {
  private readonly calls: ChatDebugCall[] = [];

  /** Record one upstream call. Returns the entry so a caller can log it directly. */
  record(step: string, model: string, usage: ChatTokenUsage): ChatDebugCall {
    const entry: ChatDebugCall = {
      step,
      model,
      promptTokens: usage.promptTokens,
      cachedPromptTokens: Math.min(usage.cachedPromptTokens, usage.promptTokens),
      completionTokens: usage.completionTokens,
      costUsd: estimateCostUsd(model, usage),
    };
    this.calls.push(entry);
    return entry;
  }

  /**
   * Record several at once. Retrieval and summarization each make their own upstream calls
   * and hand back what they spent, rather than being given the ledger to write into — a
   * module that cannot reach the ledger cannot accidentally bill a turn twice.
   */
  recordAll(calls: readonly RawCall[]): void {
    for (const call of calls) this.record(call.step, call.model, call.usage);
  }

  entries(): ChatDebugCall[] {
    return [...this.calls];
  }

  /** Estimated USD for the turn. Rounded at six places: a turn can cost a fraction of a cent. */
  totalCostUsd(): number {
    return round6(this.calls.reduce((sum, call) => sum + call.costUsd, 0));
  }

  /** Combined token counts across every call, for the one-line log summary. */
  totals(): ChatTokenUsage {
    return this.calls.reduce<ChatTokenUsage>(
      (acc, call) => ({
        promptTokens: acc.promptTokens + call.promptTokens,
        cachedPromptTokens: acc.cachedPromptTokens + call.cachedPromptTokens,
        completionTokens: acc.completionTokens + call.completionTokens,
        totalTokens: acc.totalTokens + call.promptTokens + call.completionTokens,
      }),
      { ...NO_USAGE },
    );
  }

  /**
   * What gets stored on the assistant message (`messages.usage`, migration 0005) and shown
   * in the inspector. Costs are rounded here rather than at every read, so the stored
   * document and the panel and the log all quote the same figure.
   */
  toRecord(): { calls: ChatDebugCall[]; totals: ChatTokenUsage; costUsd: number } {
    return {
      calls: this.calls.map((call) => ({ ...call, costUsd: round6(call.costUsd) })),
      totals: this.totals(),
      costUsd: this.totalCostUsd(),
    };
  }
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Smallest prompt OpenAI will cache. Below it, automatic prompt caching simply does not
 * engage — there is no setting to turn on and nothing reports that it did not happen.
 */
const PROMPT_CACHE_MINIMUM_TOKENS = 1024;

/**
 * Characters per token, for the startup estimate only.
 *
 * Measured against the real tokenizer: the static system prompt is 4,093 characters and
 * 842 tokens, so English prose in this file runs about 4.9. The divisor here is deliberately
 * *lower* than that, because the estimate feeds a "below the caching minimum" warning and an
 * optimistic estimate is the failure that matters — it would silently suppress the warning
 * on a prompt that really is too short. Erring low means the warning is occasionally
 * conservative, which costs nothing.
 */
const CHARS_PER_TOKEN = 4.5;

/** Rough token count. An estimate on purpose: this is a boot-time report, not accounting. */
function approxTokens(text: string): number {
  return Math.round(text.length / CHARS_PER_TOKEN);
}

/**
 * One-off report, at startup, of the cost controls this instance is running with (Feature 8).
 *
 * Every one of these fails silently when it is wrong. A utility model pointed at `gpt-4o`
 * still answers perfectly. A static prompt that has drifted below the caching minimum still
 * produces good replies. A model this repository has no price for still works, and simply
 * reports every turn as costing nothing. The only symptom in each case is the invoice, weeks
 * later, so the settings are stated once where they can be read against the intent.
 *
 * Never throws: this is a report, not a precondition for serving.
 */
export function logCostControls(log: { info: (obj: object, msg: string) => void; warn: (msg: string) => void }): void {
  const staticPromptTokens = approxTokens(STATIC_SYSTEM_PROMPT);

  log.info(
    {
      replyModel: config.openai.replyModel,
      utilityModel: config.openai.utilityModel,
      embeddingModel: config.openai.embeddingModel,
      maxReplyTokens: config.openai.maxReplyTokens,
      maxSummaryTokens: config.openai.maxSummaryTokens,
      verbatimMessages: config.history.verbatimMessages,
      summaryBatch: config.history.summaryBatch,
      staticPromptTokensApprox: staticPromptTokens,
    },
    "cost controls ready",
  );

  if (staticPromptTokens < PROMPT_CACHE_MINIMUM_TOKENS) {
    log.warn(
      `The static system prompt is roughly ${staticPromptTokens} tokens, below OpenAI's ` +
        `${PROMPT_CACHE_MINIMUM_TOKENS}-token minimum for prompt caching, so it cannot be cached on ` +
        "its own — only the longer prefix that includes the summary and the replayed turns can. " +
        "Do NOT reach for padding this file to clear the threshold: it was measured and it changed " +
        "nothing (docs/PLAN.md, Feature 8). Caching engages on repeated traffic, not on one " +
        "conversation at a time; watch cachedPromptTokens on the chat completion log line.",
    );
  }

  for (const model of [config.openai.replyModel, config.openai.utilityModel, config.openai.embeddingModel]) {
    if (!isPricedModel(model)) {
      log.warn(
        `No price is recorded for "${model}", so every turn using it will be reported as costing ` +
          "$0.00. Add it to PRICES in services/api/src/usage.ts.",
      );
    }
  }
}
