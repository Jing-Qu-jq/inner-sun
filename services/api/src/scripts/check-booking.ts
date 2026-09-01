// Measures the booking readiness check against labelled cases (Feature 11 AC 1).
//
//   npm run booking:check
//
// Free, offline and instant: the readiness check makes no upstream call and touches no
// database, which is the whole point of it being rule-based. So there is no `--live` mode
// here, unlike `safety:check` — this script runs the very functions production runs.
//
// Two halves, and they fail for different reasons:
//
//   * The LEXICON — "did the student ask for a human?". A miss costs a student who asked to
//     see a counselor the link they asked for, which is the funnel failing at the only moment
//     it was ever going to work. A false positive nudges somebody who was telling us about
//     therapy they had two years ago, which is tone-deaf. Both fail the run.
//   * The GATES — crisis, already-nudged, disabled, and the turn thresholds. These are the
//     rules that keep the nudge from being nagging or, worse, from landing on a student in
//     the middle of a crisis. A gate that stops holding is invisible in any single reply.
//
// What this does NOT measure is whether the thresholds are the RIGHT numbers. Six substantive
// turns, three with an escalating pattern — those are chosen, not calibrated, and what would
// calibrate them is conversion data from real conversations (Feature 19). See docs/PLAN.md.

import { assessBookingReadiness, isSubstantive, matchHumanRequestRules } from "../booking.js";
import { config } from "../config.js";
import type { CarePatternMatch } from "../retrieval.js";

interface LexiconCase {
  label: string;
  text: string;
  /** True when this message must be read as a request to talk to a human. */
  asked: boolean;
}

const LEXICON_CASES: LexiconCase[] = [
  // --- Must be caught -------------------------------------------------------------------
  { label: "starter chip (en)", text: "Can I talk to a real counselor?", asked: true },
  { label: "starter chip (zh)", text: "我可以和真人咨询师聊聊吗？", asked: true },
  { label: "plain ask", text: "I think I want to speak with a therapist about this", asked: true },
  { label: "see someone", text: "how do I see a counsellor at this university", asked: true },
  { label: "wants a human", text: "no offence but I'd rather talk to a real person about it", asked: true },
  { label: "book a session", text: "can I book an appointment with someone next week?", asked: true },
  { label: "faq phrasing", text: "How do I book a real counselor?", asked: true },
  { label: "zh appointment", text: "我想预约一次心理咨询，可以吗", asked: true },
  { label: "zh find a real person", text: "有没有办法找真人聊一聊", asked: true },

  // --- Must NOT be caught ---------------------------------------------------------------
  // Past tense: a report about something that already happened, not a request.
  { label: "past therapy", text: "I talked to a counselor back home last year and it did not really help", asked: false },
  { label: "third party", text: "my flatmate sees a therapist every Tuesday and says it helps her", asked: false },
  // The Feature 10 FAQ, in both languages. It asks what InnerSun IS, not to be handed on.
  { label: "faq: are you human", text: "Are you a real person or an AI?", asked: false },
  { label: "faq: zh are you human", text: "你是真人还是机器人？", asked: false },
  { label: "zh: is a counselor useful", text: "咨询师真的有用吗？我朋友说没什么效果", asked: false },
  { label: "ordinary distress", text: "I have been feeling really homesick and I do not know what to do about it", asked: false },
  { label: "booking a flight", text: "I need to book a flight home for the winter break but they are so expensive", asked: false },
  { label: "meeting a friend", text: "I am supposed to meet a friend for coffee later but I do not feel like going", asked: false },
];

/** A stand-in pattern for the gate cases: the only field the check reads is `escalation`. */
function pattern(escalation: string): CarePatternMatch {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "Test pattern",
    strategies: [],
    avoid: [],
    escalation,
    localeNotes: {},
    similarity: 0.7,
  };
}

const ESCALATING = [pattern("If low mood persists for weeks, suggest a human counselor.")];
const NON_ESCALATING = [pattern("")];

interface GateCase {
  label: string;
  message: string;
  priorSubstantiveTurns: number;
  applied: CarePatternMatch[];
  crisis: boolean;
  alreadyNudged: boolean;
  hadEarlierCrisis: boolean;
  expectNudge: boolean;
  expectSuppressedBy?: string;
}

const LONG = "I have been finding this whole term genuinely hard to cope with, honestly";

const GATE_CASES: GateCase[] = [
  {
    label: "an explicit request nudges immediately, on turn one",
    message: "Can I talk to a real counselor?",
    priorSubstantiveTurns: 0,
    applied: [],
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: true,
  },
  {
    label: "a crisis turn never nudges, even when asked outright (AC 4)",
    message: "Can I talk to a real counselor?",
    priorSubstantiveTurns: 9,
    applied: [],
    crisis: true,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: false,
    expectSuppressedBy: "crisis",
  },
  {
    label: "a conversation nudges at most once (AC 1)",
    message: "Can I talk to a real counselor?",
    priorSubstantiveTurns: 9,
    applied: [],
    crisis: false,
    alreadyNudged: true,
    hadEarlierCrisis: false,
    expectNudge: false,
    expectSuppressedBy: "already_nudged",
  },
  {
    label: "an earlier crisis stops the AUTOMATIC nudge for good",
    message: LONG,
    priorSubstantiveTurns: 9,
    applied: ESCALATING,
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: true,
    expectNudge: false,
    expectSuppressedBy: "crisis_earlier",
  },
  {
    label: "...but a student who asks after a crisis is still helped",
    message: "Could I see a counselor about all of this?",
    priorSubstantiveTurns: 9,
    applied: ESCALATING,
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: true,
    expectNudge: true,
  },
  {
    label: "an escalating pattern lowers the bar",
    message: LONG,
    priorSubstantiveTurns: config.booking.escalationMinStudentTurns - 1,
    applied: ESCALATING,
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: true,
  },
  {
    label: "a pattern with no escalation note does not",
    message: LONG,
    priorSubstantiveTurns: config.booking.escalationMinStudentTurns - 1,
    applied: NON_ESCALATING,
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: false,
  },
  {
    label: "turn count alone eventually nudges",
    message: LONG,
    priorSubstantiveTurns: config.booking.minStudentTurns - 1,
    applied: [],
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: true,
  },
  {
    label: "short acknowledgements never count toward it",
    message: "ok",
    priorSubstantiveTurns: config.booking.minStudentTurns - 1,
    applied: [],
    crisis: false,
    alreadyNudged: false,
    hadEarlierCrisis: false,
    expectNudge: false,
  },
];

async function main(): Promise<void> {
  console.log(
    `Booking readiness — ${LEXICON_CASES.length} lexicon cases, ${GATE_CASES.length} gate cases\n` +
      `  BOOKING_URL configured: ${Boolean(config.booking.url)}\n` +
      `  thresholds: ${config.booking.minStudentTurns} turns, ` +
      `${config.booking.escalationMinStudentTurns} with an escalating pattern, ` +
      `${config.booking.minTurnChars} chars to count\n`,
  );

  if (!config.booking.url) {
    // Every gate case would be suppressed as `disabled`, which would look like a pass in the
    // one direction that matters least. Better to refuse than to report a green run.
    throw new Error(
      "BOOKING_URL is not set, so every case would be suppressed as `disabled` and this run " +
        "would measure nothing. Set it in .env (any valid https URL will do) and try again.",
    );
  }

  const misses: string[] = [];
  const falseAlarms: string[] = [];

  console.log("Lexicon — did the student ask for a human?");
  for (const c of LEXICON_CASES) {
    const rules = matchHumanRequestRules(c.text);
    const asked = rules.length > 0;
    const ok = asked === c.asked;
    if (!ok && c.asked) misses.push(c.label);
    if (!ok && !c.asked) falseAlarms.push(`${c.label} (${rules.map((r) => r.id).join(", ")})`);
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${c.label.padEnd(26)} ${asked ? "asked" : "-    "}` +
        `  ${rules.map((r) => r.id).join(", ")}`,
    );
  }

  const gateFailures: string[] = [];
  console.log("\nGates — should this turn nudge?");
  for (const c of GATE_CASES) {
    const decision = await assessBookingReadiness({
      message: c.message,
      priorSubstantiveTurns: c.priorSubstantiveTurns,
      applied: c.applied,
      crisis: c.crisis,
      alreadyNudged: c.alreadyNudged,
      hadEarlierCrisis: async () => c.hadEarlierCrisis,
    });
    const ok =
      decision.nudge === c.expectNudge &&
      (c.expectSuppressedBy === undefined || decision.suppressedBy === c.expectSuppressedBy);
    if (!ok) {
      gateFailures.push(
        `${c.label}: expected nudge=${c.expectNudge}` +
          `${c.expectSuppressedBy ? ` suppressedBy=${c.expectSuppressedBy}` : ""}, ` +
          `got nudge=${decision.nudge} signal=${decision.signal} suppressedBy=${decision.suppressedBy ?? "-"}`,
      );
    }
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${c.label}\n` +
        `       nudge=${decision.nudge} signal=${decision.signal} ` +
        `suppressedBy=${decision.suppressedBy ?? "-"} turns=${decision.substantiveTurns}/${decision.requiredTurns}` +
        `${isSubstantive(c.message) ? "" : " (this message did not count)"}`,
    );
  }

  const positives = LEXICON_CASES.filter((c) => c.asked).length;
  const negatives = LEXICON_CASES.length - positives;
  console.log(
    `\nLexicon recall     ${positives - misses.length}/${positives} requests recognised` +
      `\nLexicon precision  ${negatives - falseAlarms.length}/${negatives} ordinary messages left alone` +
      `\nGates              ${GATE_CASES.length - gateFailures.length}/${GATE_CASES.length} correct`,
  );
  for (const m of misses) console.log(`  · missed: ${m}`);
  for (const f of falseAlarms) console.log(`  · false alarm: ${f}`);
  for (const g of gateFailures) console.log(`  · gate: ${g}`);

  if (misses.length > 0 || falseAlarms.length > 0 || gateFailures.length > 0) {
    throw new Error(
      `${misses.length} miss(es), ${falseAlarms.length} false alarm(s), ${gateFailures.length} gate failure(s).`,
    );
  }
  console.log("\nOK: every request was recognised, no ordinary message was nudged, every gate held.");
}

// No database, no OpenAI key, no server. A researcher reviewing when students get invited to
// book should be able to run this on a laptop with nothing else set up.
main().catch((err) => {
  console.error(`\nBooking check failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
