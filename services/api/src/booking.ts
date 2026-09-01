import type { CarePatternMatch } from "./retrieval.js";
import { config } from "./config.js";

/**
 * The booking nudge — the readiness check that decides when to invite a student to talk to a
 * real human counselor (Feature 11).
 *
 * This is the end of the funnel the whole product exists for, and it is deliberately the
 * *least* clever decision in the service. No model call, no learned score, no embedding: three
 * rules, read in a fixed order, on numbers that a researcher can change without a deploy. The
 * architecture's "weighted readiness scoring" is filed under Future for good reason — there is
 * no conversion data yet to weight anything against, and a score nobody can explain is a score
 * nobody can tune.
 *
 * The three signals, in precedence order:
 *
 *   1. **The student asked.** A phrase lexicon, English and Chinese, for "can I talk to a real
 *      counselor?". This fires immediately, at any point in a conversation, because the one
 *      unambiguous readiness signal is somebody saying so.
 *   2. **A matched Care Pattern contemplates escalation**, and the conversation has some
 *      substance behind it. The researcher who authored that pattern wrote down when the
 *      situation warrants a human; that is better evidence than turn count, so it needs fewer
 *      turns alongside it.
 *   3. **Turn count alone.** Enough substantive messages have accumulated that this is a real
 *      conversation rather than a passing question.
 *
 * And the things that stop it, which matter more than the things that start it:
 *
 *   • **A crisis turn never nudges** (AC 4). Feature 9's directive says it in words to the
 *     model — "they need someone now, not next week" — and this says it in code, so the rule
 *     holds whether or not the model was listening.
 *   • **A conversation that has ever been screened as a crisis** gets no *automatic* nudge for
 *     the rest of its life. Screening is per-turn (a known Feature 9 limitation), so without
 *     this a student could disclose self-harm on turn 4, write "sorry, I'm okay" on turn 5, and
 *     be invited to book an appointment on turn 6 by a rule that had simply counted to six. An
 *     explicit request still works, because refusing to help someone who has just asked to talk
 *     to a person would be a strange way to keep them safe.
 *   • **At most once per conversation** (AC 1). Enforced by an atomic claim on
 *     `conversations.booking_nudged_at`, not by asking the model to remember.
 *   • **No `BOOKING_URL`, no nudge.** A nudge with nowhere to go is a dead end, and this
 *     product already decided in Feature 9 that it does not invent destinations.
 *
 * Nothing here is ever the student's text: `rules` carries rule identifiers, exactly as the
 * crisis lexicon's do, so the whole decision can be logged and inspected without quoting a
 * word anybody wrote.
 */

/** Which part of the readiness check was satisfied. */
export type BookingSignal = "none" | "explicit_request" | "pattern_escalation" | "turn_count";

/** What held the nudge back despite (or regardless of) a signal. */
export type BookingSuppression = "crisis" | "crisis_earlier" | "already_nudged" | "disabled";

/**
 * One phrase rule for "the student asked for a human".
 *
 * Same shape and the same discipline as the crisis lexicon in safety.ts: `id` is what gets
 * logged and shown, never the pattern and never the sentence that matched it.
 */
interface HumanRequestRule {
  id: string;
  pattern: RegExp;
}

/**
 * The lexicon.
 *
 * The bar here is different from the crisis lexicon's. There, a false positive puts hotline
 * numbers in front of somebody discussing coursework, so the rules are as narrow as they can
 * be. Here the cost of a false positive is a gentle, once-only mention of a counselor — mildly
 * unwelcome, not harmful — so these can afford to read a request the way a person would.
 *
 * Two exclusions are deliberate:
 *
 *   • **Past tense.** "I talked to a counselor last year and it didn't help" is a report about
 *     the past, not a request for the future, and nudging it would be tone-deaf. The patterns
 *     match `talk` and `talking` but not `talked`, which is what the trailing `\s+` enforces.
 *   • **"Are you a real person?"** That is an FAQ about what InnerSun is (Feature 10 answers
 *     it), not a request to be handed to somebody else. None of these rules reach it — they all
 *     require a verb of wanting, meeting or booking.
 *
 * English is matched against normalized text (lowercased, apostrophes removed, punctuation
 * flattened to spaces), so "counsellor" spelling aside, "Can I talk to a real counselor?" and
 * "can i talk to a real counsellor" hit the same rule. The Chinese patterns match substrings
 * and include traditional variants, since a student on a Taiwanese or Hong Kong keyboard reaches
 * the same simplified-Chinese UI.
 */
const HUMAN_REQUEST_RULES: HumanRequestRule[] = [
  {
    id: "human.talk-to-a-person",
    pattern:
      /\b(talk|speak|chat)(ing)?\s+(to|with)\s+(a\s+|an\s+|someone\s+|somebody\s+)?(real\s+|actual\s+|human\s+|live\s+|professional\s+)?(human|person|counselor|counsellor|therapist|psychologist|professional|someone\s+real)\b/,
  },
  {
    id: "human.see-a-counselor",
    pattern: /\b(see|meet|find|get|contact)\s+(a\s+|an\s+)?(real\s+|human\s+|professional\s+|actual\s+)?(counselor|counsellor|therapist|psychologist)\b/,
  },
  {
    id: "human.want-a-human",
    pattern: /\b(want|need|prefer|would\s+like|looking\s+for)\s+(to\s+\w+\s+(to|with)\s+)?(a\s+|an\s+)?(real|human|actual)\s+(person|human|counselor|counsellor|therapist)\b/,
  },
  {
    id: "human.book-a-session",
    pattern: /\b(book|schedule|arrang(e|ing)|set\s+up|sign\s+up\s+for)\s+(a\s+|an\s+|my\s+)?(appointment|session|meeting|consultation|counseling|counselling)\b/,
  },
  // "How do I book a real counselor?" is one of the canned FAQ questions Feature 10 will
  // answer, and it is also a genuine request. Both can be true: the FAQ explains the process,
  // this hands over the link. Whichever ships second should not quietly remove the other.
  {
    id: "human.how-to-book",
    pattern: /\bhow\s+(do|can|would)\s+i\s+(book|see|get|find|reach|contact)\b/,
  },

  // The intent verb is required rather than optional: 咨询师 on its own also appears in
  // "你是咨询师吗" ("are you a counselor?"), which is the Chinese form of the FAQ above.
  {
    id: "human.zh.want-a-counselor",
    pattern: /(想|要|能否|能不能|可以|希望|需要|怎[么麼]|如何)[^。，！？!?,、\s]{0,10}(真人|(咨|諮)(询|詢)(师|師)|心理[医醫]生|心理老[师師]|治[疗療](师|師))/,
  },
  { id: "human.zh.book-appointment", pattern: /[预預][约約]|[挂掛][号號]/ },
  { id: "human.zh.real-person", pattern: /(和|跟|找)[^。，！？!?,、\s]{0,4}真人/ },
];

/** What the readiness check concluded about one turn. */
export interface BookingDecision {
  /** True when the nudge fires on this turn. At most one turn per conversation can say so. */
  nudge: boolean;
  signal: BookingSignal;
  suppressedBy?: BookingSuppression;
  /** Ids of the phrase rules that fired. Never the phrase, never the message. */
  rules: string[];
  /** Substantive student messages so far, this turn's included. */
  substantiveTurns: number;
  /** How many were needed on this turn, given whether an escalating pattern matched. */
  requiredTurns: number;
  /** Title of the matched Care Pattern whose escalation guidance counted, when one did. */
  escalationPattern?: string;
  /** True when this conversation had already used its one nudge before this turn. */
  alreadyNudged: boolean;
}

export interface BookingReadinessInput {
  /** The message that arrived on this turn. */
  message: string;
  /** Substantive student messages in this conversation BEFORE this turn. */
  priorSubstantiveTurns: number;
  /** The Care Patterns whose guidance was applied to this turn, closest first. */
  applied: CarePatternMatch[];
  /** True when crisis screening fired on this turn. */
  crisis: boolean;
  /** True when the conversation has already nudged. */
  alreadyNudged: boolean;
  /**
   * Whether this conversation has EVER triggered crisis screening.
   *
   * A thunk rather than a boolean because answering it costs a query, and the answer only
   * ever matters on the handful of turns where an automatic signal has already fired — which
   * is at most once per conversation. Ordinary turns never call it.
   */
  hadEarlierCrisis: () => Promise<boolean>;
}

/**
 * Decide whether this turn nudges, and record why either way.
 *
 * The signal is computed **before** the suppressions are applied, and is reported even when
 * something stopped it. "An explicit request, suppressed because this is a crisis turn" and
 * "nothing was ready" are very different facts about the same silent reply, and Feature 11
 * AC 5 exists because a rule-based decision that can only be inferred from the reply's wording
 * cannot be tuned.
 */
export async function assessBookingReadiness(input: BookingReadinessInput): Promise<BookingDecision> {
  const rules = matchHumanRequestRules(input.message);
  const substantiveTurns = input.priorSubstantiveTurns + (isSubstantive(input.message) ? 1 : 0);

  // Only the CLOSEST applied pattern counts. A second, weaker match also carrying escalation
  // guidance is not additional evidence that this student needs a human — it is evidence that
  // most patterns in a clinical library say something about escalation, which they do.
  const escalating = input.applied[0]?.escalation.trim() ? input.applied[0] : undefined;

  // `Math.min` rather than a straight choice, so that misconfiguring the escalation bar higher
  // than the plain one cannot make better evidence require MORE of a conversation. The lower
  // bar is the whole point of the signal.
  const requiredTurns = escalating
    ? Math.min(config.booking.escalationMinStudentTurns, config.booking.minStudentTurns)
    : config.booking.minStudentTurns;

  let signal: BookingSignal = "none";
  if (rules.length > 0) signal = "explicit_request";
  else if (substantiveTurns >= requiredTurns) signal = escalating ? "pattern_escalation" : "turn_count";

  const decision: Omit<BookingDecision, "nudge" | "suppressedBy"> = {
    signal,
    rules: rules.map((r) => r.id),
    substantiveTurns,
    requiredTurns,
    ...(escalating ? { escalationPattern: escalating.title } : {}),
    alreadyNudged: input.alreadyNudged,
  };
  const suppressed = (by: BookingSuppression): BookingDecision => ({ ...decision, nudge: false, suppressedBy: by });

  // Safety first, and unconditionally — an explicit request does not get past this one. The
  // crisis directive has taken over the whole reply, and Feature 9's resource list is already
  // pointing at people who answer now.
  if (input.crisis) return suppressed("crisis");
  if (input.alreadyNudged) return suppressed("already_nudged");
  if (!config.booking.url) return suppressed("disabled");
  if (signal === "none") return { ...decision, nudge: false };

  // See the module comment: automatic readiness is switched off for good once a conversation
  // has been screened as a crisis, because screening is per-turn and "I'm okay now" is not
  // evidence that the moment has passed. Asking for a human still works.
  if (signal !== "explicit_request" && (await input.hadEarlierCrisis())) return suppressed("crisis_earlier");

  return { ...decision, nudge: true };
}

/**
 * Whether a message says enough to count toward readiness.
 *
 * The count, not the threshold, is what makes AC 1 defensible: six exchanges of "ok", "yeah"
 * and "thanks" are not a conversation that has earned an invitation to book a counselor, and a
 * raw message count cannot tell the difference. Measured on the student's trimmed text only.
 */
export function isSubstantive(message: string): boolean {
  return message.trim().length >= config.booking.minTurnChars;
}

/**
 * Which "asked for a human" rules this text trips. Exported so a test — or anyone reviewing
 * the lexicon — can ask the question directly.
 */
export function matchHumanRequestRules(text: string): HumanRequestRule[] {
  const normalized = normalizeForRules(text);
  return HUMAN_REQUEST_RULES.filter((rule) => rule.pattern.test(normalized));
}

/**
 * Normalize before matching, so the lexicon does not carry a variant per keyboard. Identical
 * treatment to the crisis lexicon's, and for the same reason: curly apostrophes become
 * straight ones and then vanish, punctuation becomes whitespace, and runs of whitespace
 * collapse. Chinese is untouched, which is correct — those patterns match substrings.
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
 * One-off report, at startup, of whether the funnel's last step is actually wired up.
 *
 * The same reasoning as the retrieval and safety readiness reports beside it. A missing
 * `BOOKING_URL` produces a service that answers every message beautifully, builds trust
 * exactly as designed, and then never once asks the question the business depends on — with
 * nothing anywhere looking wrong. That is a silence worth breaking at boot rather than
 * discovering from a conversion report three weeks later.
 */
export function logBookingReadiness(log: {
  info: (obj: object, msg: string) => void;
  warn: (msg: string) => void;
}): void {
  log.info(
    {
      configured: Boolean(config.booking.url),
      rules: HUMAN_REQUEST_RULES.length,
      minStudentTurns: config.booking.minStudentTurns,
      escalationMinStudentTurns: config.booking.escalationMinStudentTurns,
      minTurnChars: config.booking.minTurnChars,
    },
    "booking nudge ready",
  );

  if (!config.booking.url) {
    log.warn(
      "BOOKING_URL is not set, so the booking nudge is switched off — no student will be " +
        "invited to book a counselor. Set it to a scheduling link in .env to turn the funnel on.",
    );
  }
}
