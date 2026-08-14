import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locale } from "@innersun/shared";

/**
 * Assembly of the system prompt sent to OpenAI (Feature 4; expanded in Feature 8).
 *
 * The prompt text itself lives in prompts/system-prompt.md so it can be edited
 * and reviewed as prose rather than buried in a string literal. It carries two
 * template slots: {{locale}}, filled here, and {{care_pattern_strategies}},
 * which stays empty until the RAG pipeline lands in Features 7–8.
 */

const here = dirname(fileURLToPath(import.meta.url));

// Resolved relative to this module, not the working directory — the API runs
// with services/api as cwd but the compiled entry point sits in dist/. The
// build script copies src/prompts to dist/prompts so this path holds for both.
const SYSTEM_PROMPT_PATH = join(here, "prompts", "system-prompt.md");

// Read once at startup: the file never changes at runtime, and failing here
// (loudly, at boot) beats failing on a user's first message.
const template = readFileSync(SYSTEM_PROMPT_PATH, "utf8");

/** How each locale should be named to the model, in its own script. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文 (Simplified Chinese)",
};

export interface SystemPromptOptions {
  locale: Locale;
  /**
   * Researcher-authored strategies retrieved for this conversation. Empty for
   * now; Feature 7 fills it from the Care Pattern vector search.
   */
  carePatternStrategies?: string;
}

/** Fill the template slots and return the final system prompt. */
export function buildSystemPrompt({ locale, carePatternStrategies = "" }: SystemPromptOptions): string {
  return template
    .replaceAll("{{locale}}", LOCALE_LABELS[locale])
    .replaceAll("{{care_pattern_strategies}}", carePatternStrategies.trim());
}
