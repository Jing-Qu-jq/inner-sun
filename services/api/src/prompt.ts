import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatMessage, Locale } from "@innersun/shared";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Assembly of the prompt sent to OpenAI (Feature 4, completed in Feature 8).
 *
 * The prompt text lives in prompts/*.md so it can be edited and reviewed as prose rather
 * than buried in string literals. Feature 8 split it in two, and the split is the feature:
 *
 *   prompts/system-prompt.md    static. Identical bytes on every request, forever.
 *   prompts/turn-directive.md   per-turn. The language note and the retrieved guidance.
 *
 * and the order they are assembled in is
 *
 *   [system]  static system prompt         ─┐ stable prefix: cacheable, billed at a
 *   [system]  running summary, if any       │ discount once it passes 1024 tokens and
 *   [user/assistant] recent turns          ─┘ unchanged from one turn to the next
 *   [system]  turn directive                ─┐ changes every turn — deliberately last,
 *   [user]    the message that just arrived ─┘ so it cannot invalidate the prefix
 *
 * Putting the retrieved guidance ahead of the conversation would read more naturally and
 * would cost roughly twice as much on a long conversation, because OpenAI caches the longest
 * common *prefix* of a prompt and a per-turn block near the front means there is no shared
 * prefix left to cache. Nothing about a wrongly ordered prompt looks broken — the replies are
 * fine, the bill is not — so the ordering is enforced here, in one function, rather than left
 * to each call site. `cachedPromptTokens` on the response is what proves it is working.
 */

const here = dirname(fileURLToPath(import.meta.url));

// Resolved relative to this module, not the working directory — the API runs
// with services/api as cwd but the compiled entry point sits in dist/. The
// build script copies src/prompts to dist/prompts so this path holds for both.
const PROMPTS_DIR = join(here, "prompts");

/** HTML comments in a prompt file are notes to whoever edits it, not text for the model. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Read one prompt file from prompts/.
 *
 * Callers load at module scope on purpose: the files never change at runtime, and a
 * missing or unreadable prompt should fail loudly at boot rather than on a student's
 * first message. Feature 7's match-query prompt and Feature 8's summarizer load through
 * here too, so every prompt lives in one directory and is copied to dist/ by one build step.
 *
 * HTML comments are stripped, which is what lets these files carry maintenance notes — like
 * the one at the top of system-prompt.md explaining why it must stay static — without paying
 * for them in tokens on every turn or, worse, instructing the model with them.
 */
export function loadPrompt(fileName: string): string {
  return readFileSync(join(PROMPTS_DIR, fileName), "utf8").replace(HTML_COMMENT, "").trim();
}

/**
 * The static system prompt: the same string for every student, every language, every turn.
 *
 * Exported so the readiness log can report its size — whether it clears OpenAI's 1024-token
 * minimum for prompt caching is a fact about this file, and one worth knowing at boot rather
 * than inferring from a bill.
 */
export const STATIC_SYSTEM_PROMPT = loadPrompt("system-prompt.md");

const TURN_DIRECTIVE_TEMPLATE = loadPrompt("turn-directive.md");

/** How each locale should be named to the model, in its own script. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文 (Simplified Chinese)",
};

export interface TurnDirectiveOptions {
  locale: Locale;
  /**
   * Researcher-authored guidance retrieved for this turn, already formatted by
   * retrieval.ts. Empty means no pattern cleared the relevance floor, and the
   * directive's own wording then tells the model to answer in general terms.
   */
  carePatternStrategies?: string;
}

/** Fill the per-turn template: the language note and this turn's Care Pattern guidance. */
export function buildTurnDirective({ locale, carePatternStrategies = "" }: TurnDirectiveOptions): string {
  return TURN_DIRECTIVE_TEMPLATE.replaceAll("{{locale}}", LOCALE_LABELS[locale]).replaceAll(
    "{{care_pattern_strategies}}",
    carePatternStrategies.trim(),
  );
}

export interface ChatPromptOptions {
  locale: Locale;
  /** Running summary of the messages that are no longer replayed in full (Feature 8). */
  summary?: string | null;
  /** Recent turns, oldest first, excluding the message that just arrived. */
  history: ChatMessage[];
  /** The message that just arrived. */
  message: string;
  /** This turn's Care Pattern guidance, or "" when nothing cleared the floor. */
  carePatternStrategies?: string;
}

/**
 * Build the full message array for the reply call — the whole of Feature 8 AC 1 in one place.
 *
 * The summary is introduced rather than pasted in bare: without a label the model reads a
 * paragraph of third-person prose as something *it* said, and starts answering the summary.
 */
export function buildChatMessages({
  locale,
  summary,
  history,
  message,
  carePatternStrategies = "",
}: ChatPromptOptions): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: STATIC_SYSTEM_PROMPT }];

  const running = summary?.trim();
  if (running) {
    messages.push({
      role: "system",
      content:
        "Summary of the earlier part of this conversation, which is no longer shown in full. " +
        `Treat it as things the student has already told you.\n\n${running}`,
    });
  }

  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content } as ChatCompletionMessageParam);
  }

  messages.push({ role: "system", content: buildTurnDirective({ locale, carePatternStrategies }) });
  messages.push({ role: "user", content: message });

  return messages;
}
