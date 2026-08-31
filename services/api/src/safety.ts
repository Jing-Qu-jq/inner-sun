import type { ChatMessage } from "@innersun/shared";
import { config } from "./config.js";
import { createChatCompletion } from "./openai.js";
import { loadPrompt } from "./prompt.js";
import type { RawCall } from "./usage.js";

/**
 * Crisis screening — the safety layer (Feature 9).
 *
 * Every student message is screened before the reply is written, and a positive signal
 * takes priority over everything else the turn was going to do: the retrieved Care Pattern
 * guidance is dropped, the booking nudge is suppressed, and the reply is written to a
 * different directive entirely. This is the one decision in the product that outranks the
 * knowledge base, which is the whole reason it exists as its own step rather than as a line
 * in the system prompt.
 *
 * Two detectors, deliberately independent and OR'd together:
 *
 *   • **Phrase rules** — a small, high-precision lexicon in English and Chinese. Free,
 *     synchronous, and impossible to break with an upstream outage. They are the *floor*:
 *     whatever else fails, "I want to kill myself" is caught. They are kept deliberately
 *     narrow (unambiguous, first-person statements only) precisely because a hit skips the
 *     classifier — a loose rule would be a false positive nothing could correct.
 *   • **A cheap-model classifier** — the primary detector, and the only one that can read
 *     "I don't see the point in any of this anymore" for what it is. Runs on the utility
 *     model (Feature 8's tiering), deterministic, and capped at a handful of tokens.
 *
 * **Which way it fails.** A classifier that errors, times out or answers something outside
 * its label set does NOT escalate the turn to a crisis. Failing closed sounds safer and is
 * not: an OpenAI hiccup would then put hotline numbers in front of students having an
 * ordinary conversation about their coursework, and the panel would stop meaning anything
 * the first time it cried wolf. The rules still stand underneath, the failure is logged, and
 * it is recorded on the turn's safety trace so the inspector shows it rather than hiding it.
 *
 * **What it does not do yet.** Screening is per-turn: a disclosure on turn 4 does not put
 * the conversation into a heightened state for turn 5. That is a real limitation — a
 * student who says something serious and then says "anyway, sorry" is screened afresh — and
 * it is the natural companion to Feature 23's held formulation, which is where conversation
 * state that survives a turn is being designed.
 */

const CRISIS_SCREEN_PROMPT = loadPrompt("crisis-screen.md");

/**
 * Cap on the classifier's reply. It is asked for a single label; this stops a model that
 * decides to explain itself from turning a fraction-of-a-cent call into a real one.
 */
const MAX_SCREEN_TOKENS = 8;

/** Longest slice of student text handed to the classifier, in characters. */
const MAX_SCREEN_SOURCE_CHARS = 4000;

/** How many of the student's earlier messages go in as context, besides the new one. */
const SCREEN_CONTEXT_MESSAGES = 2;

/** The kinds of risk this feature recognises. `none` is the ordinary case. */
export type CrisisCategory = "none" | "self_harm" | "harm_to_others" | "abuse_or_violence" | "medical_emergency";

/** The labels the classifier is allowed to answer with, mapped to what they mean here. */
const CLASSIFIER_LABELS: Record<string, CrisisCategory> = {
  NONE: "none",
  CRISIS_SELF_HARM: "self_harm",
  CRISIS_HARM_OTHERS: "harm_to_others",
  CRISIS_ABUSE: "abuse_or_violence",
  CRISIS_MEDICAL: "medical_emergency",
};

/**
 * One phrase rule.
 *
 * `id` is what gets logged and stored — never the pattern, and never the text that matched
 * it. A log line saying `self-harm.kill-myself` says everything an evaluation needs while
 * carrying none of the student's words, which is the same rule every other log line in this
 * service follows.
 */
interface CrisisRule {
  id: string;
  category: CrisisCategory;
  pattern: RegExp;
}

/**
 * The lexicon.
 *
 * Narrow on purpose. Each of these is a first-person statement of intent or of self-harm
 * that has no ordinary reading — there is no way to write "I want to kill myself" as an
 * exam-week exaggeration. Phrases that *usually* signal risk but sometimes do not ("I can't
 * do this any more", "suicide", "overdose") are deliberately absent: they belong to the
 * classifier, which can read them in context, and putting them here would fire crisis mode
 * on an essay about suicide-prevention policy with nothing able to overrule it.
 *
 * The English patterns are matched against text that has had its apostrophes normalized and
 * its punctuation loosened, so "I don't" and "I dont" and "I don’t" all hit the same rule.
 * The Chinese ones need no word boundaries and include the traditional variants, since a
 * student typing on a Taiwanese or Hong Kong keyboard reaches the same simplified-Chinese UI.
 */
const CRISIS_RULES: CrisisRule[] = [
  { id: "self-harm.kill-myself", category: "self_harm", pattern: /\bkill(ing)?\s+my\s?self\b/ },
  { id: "self-harm.end-my-life", category: "self_harm", pattern: /\bend(ing)?\s+(my\s+(own\s+)?life|it\s+all)\b|\btak(e|ing)\s+my\s+own\s+life\b/ },
  // "of" and "from" are excluded because "I want to die of embarrassment" is an English
  // idiom and a very ordinary thing for a stressed student to write. That costs recall on
  // the rare literal phrasing ("I want to die from an overdose"), which is exactly the kind
  // of judgement the classifier exists to make — it still sees this message.
  { id: "self-harm.want-to-die", category: "self_harm", pattern: /\b(want|wanna|wish)(ing|ed)?\s+(to\s+)?(die(?!\s+(of|from)\b)|be\s+dead)\b/ },
  { id: "self-harm.wish-i-was-dead", category: "self_harm", pattern: /\bwish\s+i\s+((was|were)\s+dead|(wasnt|werent)\s+alive|had\s+never\s+been\s+born)\b/ },
  { id: "self-harm.no-reason-to-live", category: "self_harm", pattern: /\bdont\s+want\s+to\s+(live|be\s+alive|exist)\b|\bno\s+(reason|point)\s+(to\s+live|in\s+living)\b/ },
  { id: "self-harm.suicidal", category: "self_harm", pattern: /\b(am|im|feel|feeling|having|been)\s+suicidal\b|\bsuicidal\s+(thoughts|ideation)\b/ },
  { id: "self-harm.hurt-myself", category: "self_harm", pattern: /\b(hurt(ing)?|harm(ing)?|cut(ting)?)\s+my\s?self\b/ },

  { id: "self-harm.zh.suicide", category: "self_harm", pattern: /想自[杀殺]|要自[杀殺]|自[杀殺]的?念[头頭]|[轻輕]生/ },
  { id: "self-harm.zh.self-injury", category: "self_harm", pattern: /自残|自殘|伤害自己|傷害自己/ },
  { id: "self-harm.zh.dont-want-to-live", category: "self_harm", pattern: /不想活[了下]|活不下去|不想再活|[结結]束自己的?生命|了[结結]自己/ },
  // The lookbehind drops the hyperbolic construction — 累得我想死 ("so tired I could die"),
  // 疼得我想死 — while keeping the bare statement, which is the common genuine phrasing.
  { id: "self-harm.zh.want-to-die", category: "self_harm", pattern: /(?<![得的])我想死|我好想死|真的想死/ },
];

/** What screening concluded about one turn. */
export interface SafetyScreenResult {
  crisis: boolean;
  category: CrisisCategory;
  /** What decided it. `none` when nothing fired. */
  source: "none" | "rules" | "classifier" | "both";
  /** Ids of the rules that fired. */
  rules: string[];
  /** The classifier's verdict: a label, or `skipped` / `unparsed` / `failed`. */
  classifier: string;
  durationMs: number;
  /** The upstream call it made, if it made one, for the turn's ledger. */
  calls: RawCall[];
}

export interface SafetyScreenInput {
  /** Earlier turns, oldest first, as loaded for the model. */
  history: ChatMessage[];
  /** The message that arrived on this turn. */
  message: string;
}

/**
 * Screen one turn. Never throws — a screening error is a screening result, because a
 * student is waiting and the rest of the turn has to proceed either way.
 *
 * The classifier is skipped entirely when a rule has already fired: its answer could not
 * change the outcome, and not making the call saves both the latency and the money on
 * exactly the turns where the student is least able to wait.
 */
export async function screenForCrisis(input: SafetyScreenInput): Promise<SafetyScreenResult> {
  const started = Date.now();

  // Rules run on the NEWEST message only. Screening the whole recent window with them would
  // mean a disclosure on turn 4 re-triggering crisis handling on turns 5, 6 and 7 — the
  // student says "thanks, I'm okay now" and gets the hotline panel again. The classifier is
  // the one that sees context, because it can weigh it.
  const ruleHits = matchCrisisRules(input.message);
  if (ruleHits.length > 0) {
    return {
      crisis: true,
      category: ruleHits[0]!.category,
      source: "rules",
      rules: ruleHits.map((r) => r.id),
      classifier: "skipped",
      durationMs: Date.now() - started,
      calls: [],
    };
  }

  const calls: RawCall[] = [];
  let classifier = "failed";
  let category: CrisisCategory = "none";

  try {
    const verdict = await classifyCrisis(buildScreenSource(input));
    calls.push(verdict.call);
    classifier = verdict.label;
    category = verdict.category;
  } catch {
    // Swallowed on purpose: the caller logs it and the turn proceeds unescalated. See the
    // note on which way this fails in the module comment above — the underlying error is
    // already logged by the layer that produced it.
  }

  const crisis = category !== "none";
  return {
    crisis,
    category,
    source: crisis ? "classifier" : "none",
    rules: [],
    classifier,
    durationMs: Date.now() - started,
    calls,
  };
}

/**
 * Whether the phrase lexicon already settles this turn, with no upstream call at all.
 *
 * An OPTIMIZATION HINT and nothing more: `screenForCrisis` above remains the only thing that
 * decides, and a `true` here guarantees only that it will answer `crisis` without needing the
 * classifier. The chat route asks this before dispatching Care-Pattern retrieval, so that a
 * student who has just written an unambiguous disclosure does not wait two upstream calls for
 * guidance that is about to be discarded.
 */
export function hasObviousCrisis(message: string): boolean {
  return matchCrisisRules(message).length > 0;
}

/**
 * Normalize before matching, so that the lexicon does not have to carry a variant per
 * keyboard. Curly apostrophes become straight ones and then vanish, punctuation and
 * underscores become spaces, and runs of whitespace collapse — which is what makes
 * `\bkill\s+my\s?self\b` catch "kill my-self", "kill  myself" and "KILL MYSELF!!!" alike.
 *
 * Chinese is left alone by all of this, which is correct: the Chinese patterns match
 * substrings and need no word boundaries.
 */
function normalizeForRules(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which phrase rules this text trips. Exported so a test — and a researcher reviewing the
 * lexicon — can ask the question directly without going near OpenAI.
 */
export function matchCrisisRules(text: string): CrisisRule[] {
  const normalized = normalizeForRules(text);
  return CRISIS_RULES.filter((rule) => rule.pattern.test(normalized));
}

/**
 * The text the classifier judges: the student's last couple of messages, then the one that
 * just arrived, labelled.
 *
 * **Only the student's messages**, for the same reason retrieval uses only theirs — our
 * replies are an echo of what we already decided, and a companion that had just offered
 * gentle coping advice would be feeding that advice back into the judgement of whether the
 * student is in danger. And **labelled**, so the model knows which message it is ruling on:
 * an unlabelled blob makes a two-turn-old sentence as current as the newest one, which is
 * precisely the sliding-crisis-state problem the rules avoid by only reading the last message.
 */
function buildScreenSource({ history, message }: SafetyScreenInput): string {
  const earlier = history
    .filter((m) => m.role === "user")
    .slice(-SCREEN_CONTEXT_MESSAGES)
    .map((m) => m.content);

  const sections: string[] = [];
  if (earlier.length > 0) sections.push(`[Earlier messages from the student, for context]\n${earlier.join("\n")}`);
  sections.push(`[The message to assess]\n${message.trim()}`);

  // Trimmed from the FRONT, so the message being assessed is the last thing to be dropped.
  const joined = sections.join("\n\n").trim();
  return joined.length > MAX_SCREEN_SOURCE_CHARS ? joined.slice(-MAX_SCREEN_SOURCE_CHARS) : joined;
}

/**
 * Ask the cheap model for a single label.
 *
 * Strict parsing: anything outside the label set is `unparsed` and is NOT treated as a
 * crisis. A model that answered "I think this student may be at risk, because..." would
 * otherwise be silently read as whichever label happened to appear in its sentence.
 */
async function classifyCrisis(source: string): Promise<{ label: string; category: CrisisCategory; call: RawCall }> {
  const { reply, model, usage } = await createChatCompletion({
    model: config.openai.utilityModel,
    maxTokens: MAX_SCREEN_TOKENS,
    // Deterministic. A safety judgement that changed between two identical messages would
    // make the whole layer impossible to evaluate, and evaluation is AC 5's entire point.
    temperature: 0,
    messages: [
      { role: "system", content: CRISIS_SCREEN_PROMPT },
      { role: "user", content: source },
    ],
  });

  const call: RawCall = { step: "crisis-screen", model, usage };
  const label = reply.trim().toUpperCase().replace(/[^A-Z_]/g, "");
  const category = CLASSIFIER_LABELS[label];
  if (!category) return { label: "unparsed", category: "none", call };
  return { label, category, call };
}

/**
 * One-off report, at startup, that the safety layer is actually assembled (Feature 9).
 *
 * The same reasoning as the retrieval and cost-control reports next to it: every part of
 * this fails silently. A lexicon that failed to load, a prompt file missing from dist/, a
 * classifier pointed at a model that no longer exists — all of them produce a service that
 * answers every message beautifully and screens none of them. The only symptom is the one
 * you never want to discover from an incident.
 */
export function logSafetyReadiness(log: { info: (obj: object, msg: string) => void; warn: (msg: string) => void }): void {
  log.info(
    {
      rules: CRISIS_RULES.length,
      classifierModel: config.openai.utilityModel,
      labels: Object.keys(CLASSIFIER_LABELS).length,
      promptChars: CRISIS_SCREEN_PROMPT.length,
    },
    "crisis screening ready",
  );

  if (CRISIS_RULES.length === 0 || CRISIS_SCREEN_PROMPT.length === 0) {
    log.warn(
      "Crisis screening is not fully assembled — the phrase lexicon or the classifier prompt is " +
        "empty. Every message will be answered as if it were ordinary.",
    );
  }
}
