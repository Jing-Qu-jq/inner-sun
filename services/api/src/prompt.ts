import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locale } from "@innersun/shared";

/**
 * Assembly of the system prompt sent to OpenAI (Feature 4; expanded in Feature 8).
 *
 * The prompt text itself lives in prompts/system-prompt.md so it can be edited
 * and reviewed as prose rather than buried in a string literal. It carries two
 * template slots: {{locale}} and {{care_pattern_strategies}}, the latter filled
 * from the Care Patterns retrieval matched for this turn (Feature 7) and empty
 * when nothing cleared the relevance floor.
 */

const here = dirname(fileURLToPath(import.meta.url));

// Resolved relative to this module, not the working directory — the API runs
// with services/api as cwd but the compiled entry point sits in dist/. The
// build script copies src/prompts to dist/prompts so this path holds for both.
const PROMPTS_DIR = join(here, "prompts");

/**
 * Read one prompt file from prompts/.
 *
 * Callers load at module scope on purpose: the files never change at runtime, and a
 * missing or unreadable prompt should fail loudly at boot rather than on a student's
 * first message. Feature 7's match-query prompt loads through here too, so both live
 * in the same directory and are copied to dist/ by the same build step.
 */
export function loadPrompt(fileName: string): string {
  return readFileSync(join(PROMPTS_DIR, fileName), "utf8");
}

const template = loadPrompt("system-prompt.md");

/** How each locale should be named to the model, in its own script. */
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文 (Simplified Chinese)",
};

export interface SystemPromptOptions {
  locale: Locale;
  /**
   * Researcher-authored guidance retrieved for this turn, already formatted by
   * retrieval.ts. Empty means no pattern cleared the relevance floor, and the
   * prompt's own wording then tells the model to answer in general terms.
   */
  carePatternStrategies?: string;
}

/** Fill the template slots and return the final system prompt. */
export function buildSystemPrompt({ locale, carePatternStrategies = "" }: SystemPromptOptions): string {
  return template
    .replaceAll("{{locale}}", LOCALE_LABELS[locale])
    .replaceAll("{{care_pattern_strategies}}", carePatternStrategies.trim());
}
