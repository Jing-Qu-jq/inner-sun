// Calibrates the Care Pattern relevance floor against real content (Feature 7 AC 5).
//
//   npm run retrieval:calibrate
//
// The floor decides whether a student gets researcher-authored guidance or a general
// empathetic reply, and it is the one number in the retrieval pipeline that cannot be
// reasoned out from first principles. Cosine similarity is not a percentage: its absolute
// values depend on the embedding model AND on how the patterns happen to be worded, so
// "0.8 means very similar" is folklore. docs/ARCHITECTURE.md suggested starting at 0.7–0.8;
// on this library with text-embedding-3-small, a *correct* match scores around 0.45–0.66,
// and a floor of 0.7 would mean no student ever sees a Care Pattern — silently, with every
// reply looking perfectly fine.
//
// So it is measured. This script runs labelled cases through the very pipeline the chat
// route runs (retrieval.ts, imported, not reimplemented):
//
//   * MATCH cases  — messages a student might send, where one pattern is clearly right.
//                    Their scores set how LOW the floor may be pushed before it starts
//                    rejecting good guidance.
//   * GAP cases    — messages with real substance that this library genuinely does not
//                    cover, plus small talk. Their scores set how HIGH the floor must be
//                    before unrelated guidance stops reaching people.
//
// A floor between those two bands separates them. If the bands overlap, no threshold can
// separate them, and the answer is better patterns rather than a better number.
//
// Cost: one gpt-4o-mini call and two embeddings per case — a fraction of a cent for a full
// run. Re-run it whenever the pattern library changes materially; the cases below are
// written against the Feature 6 starter set and must be rewritten with it.

import { config } from "../config.js";
import { pool } from "../db.js";
import { buildMatchSource, normalizeToEnglish, rankCarePatterns } from "../retrieval.js";

interface Case {
  /** What a student would actually type. */
  text: string;
  /**
   * The pattern that should come back first, or null for a case this library does not
   * cover — where the right outcome is a logged Care-Pattern gap, not a forced match.
   */
  expectedId: string | null;
  /** Short label for the report. */
  label: string;
}

const CASES: Case[] = [
  // --- Should match: one pattern is clearly the right one -------------------------------
  {
    label: "homesickness",
    text: "I can't stop thinking about my family back home and I really miss the food I grew up with",
    expectedId: "11111111-1111-4111-8111-111111111111",
  },
  {
    label: "second-language coursework",
    text: "the readings take me three times longer than my classmates because English isn't my first language",
    expectedId: "22222222-2222-4222-8222-222222222222",
  },
  {
    label: "no friends yet",
    text: "I've been here three months and I still eat lunch alone every day, I don't know how people make friends here",
    expectedId: "33333333-3333-4333-8333-333333333333",
  },
  {
    label: "visa deadline",
    text: "my visa paperwork is due next month and I'm terrified I'll get something wrong and have to leave",
    expectedId: "44444444-4444-4444-8444-444444444444",
  },
  {
    label: "money, in Chinese",
    text: "我的奖学金根本不够付房租，我不敢跟家里说，只能每天吃泡面",
    expectedId: "55555555-5555-4555-8555-555555555555",
  },
  {
    label: "parents' expectations, in Chinese",
    text: "父母一直希望我读博士，可是我真的撑不下去了，我怕让他们失望",
    expectedId: "66666666-6666-4666-8666-666666666666",
  },
  {
    label: "mocked for an accent",
    text: "a guy in my lab keeps mimicking my accent and everyone laughs, I don't know if I'm overreacting",
    expectedId: "77777777-7777-4777-8777-777777777777",
  },
  {
    label: "time-zone sleep",
    text: "I stay up until 3am to call my parents and then I can't concentrate in my 9am lecture",
    expectedId: "88888888-8888-4888-8888-888888888888",
  },
  {
    label: "imposter feelings",
    text: "everyone in my cohort seems so much smarter than me, I never say anything in seminars",
    expectedId: "99999999-9999-4999-8999-999999999999",
  },
  {
    label: "long-distance strain",
    text: "my girlfriend is still back home and we barely talk now because of the time difference, it feels like we are drifting apart",
    expectedId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  {
    label: "stigma about counseling",
    text: "I know the university has a counseling service but going there would mean admitting something is wrong with me",
    expectedId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  },
  {
    label: "life after graduation",
    text: "I graduate in May and I have no idea whether I can stay in this country or what job I could even get",
    expectedId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },

  // --- Should NOT match: real content, but nothing here covers it -----------------------
  {
    label: "gap · roommate dishes",
    text: "my roommate keeps leaving dirty dishes in the sink for days and I don't know how to bring it up without a fight",
    expectedId: null,
  },
  {
    label: "gap · sprained ankle",
    text: "I sprained my ankle playing basketball and getting across campus to my classes is taking forever now",
    expectedId: null,
  },
  {
    label: "gap · bike stolen",
    text: "someone cut the lock and stole my bike outside the library and the police just gave me a reference number",
    expectedId: null,
  },
  {
    label: "gap · credit transfer",
    text: "I want to switch my major from engineering to design and I can't work out which credits would transfer",
    expectedId: null,
  },
  { label: "gap · greeting", text: "hey there, how are you doing today?", expectedId: null },
  { label: "gap · homework request", text: "can you write my essay about supply chains for me", expectedId: null },
];

interface Measured extends Case {
  /** The English match query the normalizer produced, or undefined for "no situation". */
  query?: string;
  topTitle: string;
  topId: string;
  /** Similarity of the top hit for the normalized query — what production actually uses. */
  score: number;
  /** Same, for the student's raw text: what skipping normalization would have scored. */
  rawScore: number;
  /** Did the expected pattern come back first? Always true for gap cases (nothing expected). */
  rankedCorrectly: boolean;
}

async function measure(testCase: Case): Promise<Measured> {
  // Wrapped exactly as a first turn would be, labels and all, so these numbers are the ones
  // production produces rather than a close relative of them.
  const query = await normalizeToEnglish(buildMatchSource({ history: [], message: testCase.text }).text);

  // "No situation to describe" is the normalizer refusing small talk, which is a correct
  // outcome for a gap case: retrieval stops before it spends anything on the search.
  if (!query) {
    return {
      ...testCase,
      topTitle: "(normalizer: no situation)",
      topId: "",
      score: 0,
      rawScore: 0,
      rankedCorrectly: testCase.expectedId === null,
    };
  }

  const [normalized, raw] = await Promise.all([rankCarePatterns(query), rankCarePatterns(testCase.text)]);
  const top = normalized[0];

  return {
    ...testCase,
    query,
    topTitle: top?.title ?? "(no patterns)",
    topId: top?.id ?? "",
    score: top?.similarity ?? 0,
    rawScore: raw[0]?.similarity ?? 0,
    rankedCorrectly: testCase.expectedId === null || top?.id === testCase.expectedId,
  };
}

function pad(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

async function main(): Promise<void> {
  console.log(
    `Calibrating the Care Pattern relevance floor\n` +
      `  embedding model : ${config.openai.embeddingModel}\n` +
      `  utility model   : ${config.openai.utilityModel}\n` +
      `  configured floor: ${config.retrieval.relevanceFloor}\n` +
      `  cases           : ${CASES.length}\n`,
  );

  const results: Measured[] = [];
  for (const testCase of CASES) {
    // Sequential rather than parallel: a burst of calls can trip a rate limit, and this
    // script has no deadline to meet.
    results.push(await measure(testCase));
  }

  console.log(`${pad("case", 30)}${pad("top match", 34)}${pad("score", 8)}${pad("raw", 8)}rank`);
  console.log("-".repeat(88));
  for (const r of results) {
    console.log(
      pad(r.label, 30) +
        pad(r.topTitle, 34) +
        pad(r.score.toFixed(4), 8) +
        pad(r.rawScore.toFixed(4), 8) +
        (r.rankedCorrectly ? "ok" : "WRONG"),
    );
  }

  const matches = results.filter((r) => r.expectedId !== null);
  const gaps = results.filter((r) => r.expectedId === null);
  const lowestMatch = Math.min(...matches.map((r) => r.score));
  const highestGap = Math.max(...gaps.map((r) => r.score));

  console.log(
    `\nScore bands\n` +
      `  correct matches : ${Math.min(...matches.map((r) => r.score)).toFixed(4)} – ${Math.max(...matches.map((r) => r.score)).toFixed(4)}  (${matches.length} cases)\n` +
      `  uncovered / small talk : ${Math.min(...gaps.map((r) => r.score)).toFixed(4)} – ${highestGap.toFixed(4)}  (${gaps.length} cases)`,
  );

  // Normalization is a cost and a latency decision as much as a quality one, so the run
  // reports what it actually bought rather than assuming it was worth it.
  const normalizedWins = results.filter((r) => r.expectedId !== null && r.score > r.rawScore).length;
  const meanGain =
    matches.reduce((sum, r) => sum + (r.score - r.rawScore), 0) / (matches.length === 0 ? 1 : matches.length);
  console.log(
    `\nEnglish normalization: improved the score on ${normalizedWins}/${matches.length} match cases, ` +
      `mean change ${meanGain >= 0 ? "+" : ""}${meanGain.toFixed(4)}`,
  );

  if (highestGap >= lowestMatch) {
    console.log(
      `\n⚠️  The bands OVERLAP: an uncovered message scored ${highestGap.toFixed(4)} while a correct ` +
        `match scored only ${lowestMatch.toFixed(4)}.\n` +
        "   No floor separates them. Either the pattern that scored too low is worded too diffusely,\n" +
        "   or a pattern is worded so broadly that it attracts everything. Fix the content, not the number.",
    );
  } else {
    const suggested = Math.round(((lowestMatch + highestGap) / 2) * 100) / 100;
    console.log(
      `\nSuggested floor: ${suggested.toFixed(2)}  (midpoint of ${highestGap.toFixed(4)} … ${lowestMatch.toFixed(4)})\n` +
        `  Set CARE_PATTERN_RELEVANCE_FLOOR=${suggested.toFixed(2)}, or leave the default if it already sits in that band.`,
    );
  }

  const floor = config.retrieval.relevanceFloor;
  const missed = matches.filter((r) => r.score < floor);
  const falseApplies = gaps.filter((r) => r.score >= floor);
  console.log(
    `\nAt the configured floor of ${floor}:\n` +
      `  ${matches.length - missed.length}/${matches.length} correct matches would be applied\n` +
      `  ${falseApplies.length}/${gaps.length} uncovered messages would wrongly get guidance`,
  );
  for (const r of missed) console.log(`  · missed: ${r.label} (${r.score.toFixed(4)})`);
  for (const r of falseApplies) console.log(`  · false apply: ${r.label} → ${r.topTitle} (${r.score.toFixed(4)})`);

  const misranked = results.filter((r) => !r.rankedCorrectly);
  if (misranked.length > 0) {
    throw new Error(
      `${misranked.length} case(s) retrieved the wrong pattern first:\n  - ` +
        misranked.map((r) => `${r.label}: got "${r.topTitle}"`).join("\n  - "),
    );
  }

  console.log(`\nOK: every match case retrieved its expected Care Pattern first.`);
}

main()
  .catch((err) => {
    console.error(`\nCalibration failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
