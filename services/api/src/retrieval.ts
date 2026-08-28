import type { ChatMessage, Locale } from "@innersun/shared";
import { config } from "./config.js";
import { dbQuery } from "./db.js";
import { embedText } from "./embeddings.js";
import { createChatCompletion } from "./openai.js";
import { loadPrompt } from "./prompt.js";
import type { RawCall } from "./usage.js";

/**
 * Care Pattern retrieval and matching — the RAG pipeline (Feature 7).
 *
 * This is the part of InnerSun that makes it more than a wrapper around a chat model: the
 * reply is steered by researcher-authored clinical guidance retrieved for *this* student's
 * situation. The match is vector math, not the model reasoning about which pattern to use.
 *
 * One turn runs four steps (docs/ARCHITECTURE.md §3):
 *
 *   1. Build a compact match query from the conversation.
 *   2. Normalize it to English with the cheap model — the knowledge base is English and
 *      cross-lingual embedding recall is measurably weaker than English→English.
 *   3. Embed it with the same model that embedded every pattern's `situation`.
 *   4. Rank published patterns by cosine similarity and gate on the relevance floor.
 *
 * Everything here degrades rather than fails. A student who writes about a situation we have
 * no pattern for still gets an empathetic reply; so does one whose turn arrives while OpenAI
 * is refusing embeddings. Retrieval is an enhancement to the reply, never a precondition for
 * it — so the only thing a retrieval failure costs is the guidance, and it is logged.
 */

const MATCH_QUERY_PROMPT = loadPrompt("match-query.md");

/**
 * Cap on the normalized query. The prompt asks for 40 words; this is the hard stop that
 * keeps a misbehaving completion from turning a cheap call into an expensive one.
 */
const MAX_MATCH_QUERY_TOKENS = 120;

/** The sentinel the normalizer returns when there is no situation to describe. */
const NO_SITUATION = "NONE";

/** Longest slice of student text we send to the normalizer, in characters. */
const MAX_MATCH_SOURCE_CHARS = 2000;

export interface CarePatternMatch {
  id: string;
  title: string;
  strategies: string[];
  avoid: string[];
  escalation: string;
  localeNotes: Partial<Record<Locale, string>>;
  /** Cosine similarity to the match query, 0–1. Higher is closer. */
  similarity: number;
}

/**
 * Why this turn ended up with the guidance it did. Recorded on every turn so the floor can
 * be calibrated from real traffic rather than from intuition (docs/ARCHITECTURE.md §3).
 */
export type MatchOutcome =
  /** At least one pattern cleared the floor; its strategies went into the prompt. */
  | "applied"
  /** Patterns were searched and none was close enough — a genuine Care-Pattern gap. */
  | "below_floor"
  /** Nothing in the library is retrievable at all (empty, unpublished, or unembedded). */
  | "no_patterns"
  /** Too little student text to match on yet — a greeting, an "ok". Not a gap. */
  | "low_signal"
  /** The pipeline itself failed. An operational problem, not an authoring one. */
  | "failed";

export interface RetrievalResult {
  outcome: MatchOutcome;
  /** Patterns at or above the floor, closest first. Non-empty only when `applied`. */
  applied: CarePatternMatch[];
  /** Everything the search returned, closest first — for the log, not for the prompt. */
  candidates: CarePatternMatch[];
  /**
   * The "Care-Pattern gap" flag (Feature 7 AC 3, collected by Feature 19).
   *
   * True means a student described something real and the knowledge base had no answer for
   * it — the signal that tells the researcher which pattern to write next. Deliberately
   * NOT set for `low_signal` (there was no situation to cover) or for `failed` and
   * `no_patterns` (our machinery broke; that is not a hole in anyone's clinical content).
   */
  gap: boolean;
  durationMs: number;
  /**
   * The English match query the normalizer produced — what was actually embedded.
   *
   * Derived from the student's words, so it is deliberately NOT logged: the chat route's
   * log line picks its fields one by one for exactly this reason. It is returned only to a
   * privileged viewer through the Feature 22 inspector, where seeing it is the point —
   * most surprising matches are explained by this sentence rather than by the vector search.
   */
  query?: string;
  /**
   * The upstream calls this pipeline made — the normalizer, and the embedding when it got
   * that far (Feature 8). Handed back rather than logged here so the whole turn's cost is
   * accounted for in one ledger, in the order the calls happened.
   */
  calls: RawCall[];
}

export interface MatchSource {
  /** The labelled text handed to the normalizer. */
  text: string;
  /** How many characters of the student's OWN words it contains — what the cost gate reads. */
  studentChars: number;
}

export interface RetrievalInput {
  /** Earlier turns, oldest first, as loaded for the model. */
  history: ChatMessage[];
  /** The message that arrived on this turn. */
  message: string;
  /**
   * The conversation's running summary (Feature 8), or null before one exists. It stands in
   * for the messages that are no longer replayed, so a match on a long conversation still
   * reflects what the student came to talk about and not only the last few turns.
   */
  summary?: string | null;
}

/**
 * Match the running conversation to Care Patterns and return what should steer this reply.
 *
 * Never throws: every failure path resolves to a result whose `applied` is empty, because a
 * student is waiting for an answer and the guidance is the optional half of it.
 */
export async function retrieveCarePatterns(input: RetrievalInput): Promise<RetrievalResult> {
  const started = Date.now();
  let matchQuery: string | undefined;
  const calls: RawCall[] = [];
  const done = (outcome: MatchOutcome, applied: CarePatternMatch[], candidates: CarePatternMatch[]): RetrievalResult => ({
    outcome,
    applied,
    candidates,
    gap: outcome === "below_floor",
    durationMs: Date.now() - started,
    query: matchQuery,
    calls,
  });

  const source = buildMatchSource(input);
  if (source.studentChars < config.retrieval.minSignalChars) {
    // Nothing is appended to `calls`: a skipped step costs nothing and should read as an
    // absence in the ledger, not as a zero-token call that looks like it ran.
    return done("low_signal", [], []);
  }

  try {
    const normalized = await normalizeToEnglish(source.text);
    calls.push(normalized.call);
    matchQuery = normalized.query;
    if (!matchQuery) return done("low_signal", [], []);

    const ranked = await rankCarePatterns(matchQuery);
    calls.push(ranked.call);
    const candidates = ranked.matches;
    if (candidates.length === 0) return done("no_patterns", [], []);

    const applied = candidates.filter((c) => c.similarity >= config.retrieval.relevanceFloor);
    return applied.length > 0 ? done("applied", applied, candidates) : done("below_floor", [], candidates);
  } catch {
    // Swallowed on purpose — the caller logs the outcome and answers without guidance.
    // The underlying error is already logged by whichever layer produced it.
    return done("failed", [], []);
  }
}

/**
 * The text the match is computed from: the running summary, the student's own recent
 * messages, and — labelled as such — the message that just arrived.
 *
 * **Only the student's messages.** Replaying our own replies here would feed the guidance we
 * already injected back into the query that selects the guidance — a pattern would keep
 * re-selecting itself as the conversation drifted away from it, and the match would get
 * stickier the longer someone talked. Their words are the evidence; ours are an echo.
 *
 * **The sections are labelled** because an unlabelled blob makes every message equally
 * current, and they are not. Measured on a real conversation: a student talked about sleep
 * for two turns, then switched to money, and the flat version still ranked the sleep pattern
 * first (0.70) with the financial one second (0.59) — the reply led with guidance for the
 * problem they had stopped talking about. Naming the newest message lets the normalizer
 * foreground it while keeping earlier turns as context, which is what the labels buy.
 *
 * Exported so the calibration script measures the same wrapping production sends.
 */
export function buildMatchSource({ history, message, summary }: RetrievalInput): MatchSource {
  const recentStudentTurns = history
    .filter((m) => m.role === "user")
    .slice(-Math.max(config.retrieval.matchWindow - 1, 0))
    .map((m) => m.content);

  const sections: string[] = [];
  if (summary?.trim()) sections.push(`[Summary so far]\n${summary.trim()}`);
  if (recentStudentTurns.length > 0) {
    sections.push(`[Earlier messages from the student]\n${recentStudentTurns.join("\n")}`);
  }
  sections.push(`[Most recent message from the student]\n${message.trim()}`);

  // Trimmed from the FRONT: the newest message says what the student is dealing with now,
  // so it is the last thing that should be dropped.
  const joined = sections.join("\n\n").trim();
  const text = joined.length > MAX_MATCH_SOURCE_CHARS ? joined.slice(-MAX_MATCH_SOURCE_CHARS) : joined;

  // Counted WITHOUT the labels and the summary. The labels are ours, not the student's, and
  // they add about forty characters — enough that a signal threshold measured against the
  // whole blob would never fire, and "hi" would cost an upstream call to discover it says
  // nothing. The summary is excluded for the same reason: it is our text, not theirs.
  const studentChars = [...recentStudentTurns, message].join(" ").trim().length;

  return { text, studentChars };
}

/**
 * Distil the conversation fragment into a short English situation description.
 *
 * Two jobs in one cheap call. The obvious one is language: Care Patterns are authored in
 * English and a Chinese conversation must still reach them, so the query crosses the
 * language boundary here rather than relying on the embedding model's weaker cross-lingual
 * recall. The quieter one is shape — patterns describe situations in the third person
 * ("An international student feels..."), and a query written the same way sits closer to
 * them in vector space than a raw first-person venting message does.
 *
 * `query` is undefined when there is nothing worth matching on. The call is reported either
 * way, because it happened either way — a normalizer that answers `NONE` to small talk still
 * costs a few hundred tokens, and a cost model that only counted successful matches would
 * understate exactly the turns that are cheapest to fix.
 *
 * Exported so `npm run retrieval:calibrate` measures the very pipeline that runs in
 * production. A calibration script with its own copy of this step would be calibrating
 * something else, and the floor it recommended would be a number about a different system.
 */
export async function normalizeToEnglish(source: string): Promise<{ query?: string; call: RawCall }> {
  const { reply, model, usage } = await createChatCompletion({
    model: config.openai.utilityModel,
    maxTokens: MAX_MATCH_QUERY_TOKENS,
    // Deterministic: the same conversation should produce the same match, so that a floor
    // calibrated yesterday still means the same thing today.
    temperature: 0,
    messages: [
      { role: "system", content: MATCH_QUERY_PROMPT },
      { role: "user", content: source },
    ],
  });

  const call: RawCall = { step: "match-query", model, usage };
  const query = reply.trim();
  if (!query || query.toUpperCase().startsWith(NO_SITUATION)) return { call };
  return { query, call };
}

/**
 * Embed a query and rank the library against it, closest first.
 *
 * Split out from the gating above so the calibration script can ask "what would this text
 * match, and how strongly?" without a floor being applied to the answer — deciding the
 * floor is the whole point of running it.
 */
export async function rankCarePatterns(
  queryText: string,
): Promise<{ matches: CarePatternMatch[]; call: RawCall }> {
  const { vector, model, usage } = await embedText(queryText);
  return { matches: await searchCarePatterns(vector), call: { step: "match-embedding", model, usage } };
}

interface PatternRow {
  id: string;
  title: string;
  strategies: string[];
  avoid: string[];
  escalation: string;
  locale_notes: Partial<Record<Locale, string>> | null;
  similarity: string | number;
}

/**
 * The vector search: the top-N closest published patterns, with their scores.
 *
 * Three filters, and each one exists to keep a meaningless number out of the ranking:
 * `status = 'published'` because a draft is unfinished clinical content (migration 0004),
 * `not needs_embedding` because such a vector does not reflect its own `situation`
 * (migration 0002), and the model check because vectors from two different embedding models
 * are not comparable — mixing them yields plausible-looking similarity scores rather than an
 * error. Excluded rows are counted for the startup readiness log, since a pattern that is
 * silently unreachable is the failure this whole design is built to avoid.
 */
async function searchCarePatterns(vector: string): Promise<CarePatternMatch[]> {
  const { rows } = await dbQuery<PatternRow>(
    `select id, title, strategies, avoid, escalation, locale_notes,
            1 - (embedding <=> $1::vector) as similarity
       from care_patterns
      where status = 'published'
        and embedding is not null
        and not needs_embedding
        and embedding_model = $2
      order by embedding <=> $1::vector
      limit $3`,
    [vector, config.openai.embeddingModel, config.retrieval.topN],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    strategies: row.strategies,
    avoid: row.avoid,
    escalation: row.escalation,
    localeNotes: row.locale_notes ?? {},
    similarity: Number(row.similarity),
  }));
}

/**
 * Render matched patterns into the `{{care_pattern_strategies}}` slot of the system prompt.
 *
 * Scores are deliberately left out. The model does not need the number to use the guidance,
 * and a model given "0.61" in its context is a model that can mention it to a student.
 * Order carries the same information: closest first, and the wording says so.
 */
export function formatCarePatternGuidance(matches: CarePatternMatch[], locale: Locale): string {
  if (matches.length === 0) return "";

  const blocks = matches.map((match, index) => {
    const lines = [`### ${index === 0 ? "Closest match" : `Also relevant (${index + 1})`}: ${match.title}`];

    if (match.strategies.length > 0) {
      lines.push("Use these strategies:", ...match.strategies.map((s) => `- ${s}`));
    }
    if (match.avoid.length > 0) {
      lines.push("Do not:", ...match.avoid.map((a) => `- ${a}`));
    }
    if (match.escalation.trim()) {
      lines.push(`When to suggest a human counselor: ${match.escalation.trim()}`);
    }

    // The note for the language this student is being answered in. A pattern's other locale
    // notes are about other cultural contexts and would only be noise here.
    const note = match.localeNotes?.[locale]?.trim();
    if (note) lines.push(`Cultural note for this student's language: ${note}`);

    return lines.join("\n");
  });

  return blocks.join("\n\n");
}

/**
 * One-off report, at startup, of how much of the library retrieval can actually see.
 *
 * A published pattern that is missing or carrying a stale vector is invisible to the search
 * with nothing anywhere reporting it — the row looks perfectly healthy in any table viewer.
 * That silence is the failure mode this logs against. Never throws: a database that is not
 * up yet must not stop the server from booting.
 */
export async function logRetrievalReadiness(log: {
  info: (obj: object, msg: string) => void;
  warn: (msg: string) => void;
}): Promise<void> {
  try {
    const { rows } = await dbQuery<{ retrievable: string; unretrievable: string }>(
      `select count(*) filter (where embedding is not null and not needs_embedding
                                 and embedding_model = $1) as retrievable,
              count(*) filter (where embedding is null or needs_embedding
                                 or embedding_model is distinct from $1) as unretrievable
         from care_patterns
        where status = 'published'`,
      [config.openai.embeddingModel],
    );

    const retrievable = Number(rows[0]?.retrievable ?? 0);
    const unretrievable = Number(rows[0]?.unretrievable ?? 0);

    log.info(
      {
        retrievable,
        unretrievable,
        embeddingModel: config.openai.embeddingModel,
        relevanceFloor: config.retrieval.relevanceFloor,
        topN: config.retrieval.topN,
      },
      "care pattern retrieval ready",
    );

    if (retrievable === 0) {
      log.warn(
        "No Care Pattern is retrievable — every reply will be generic. Publish patterns and " +
          "embed them with `npm run db:reembed -- --stale`.",
      );
    } else if (unretrievable > 0) {
      log.warn(
        `${unretrievable} published Care Pattern(s) are invisible to retrieval (no embedding, ` +
          `flagged as stale, or embedded with a different model than ${config.openai.embeddingModel}). ` +
          "Fix with `npm run db:reembed -- --stale`.",
      );
    }
  } catch {
    log.warn("Could not check Care Pattern retrieval readiness — the database was unreachable at startup.");
  }
}
