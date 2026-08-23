import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Central place to read and validate environment configuration.
 * See .env.example at the repo root for the full list of variables.
 */

const here = dirname(fileURLToPath(import.meta.url));

// Load the repo-root .env explicitly rather than by cwd. The API runs with
// services/api as its working directory (both via `npm run dev` and from dist/),
// so bare `dotenv/config` would look for services/api/.env, find nothing, and
// silently leave every variable undefined. Same approach as db/scripts/lib/env.ts.
// The path is ../../.. from either src/ or dist/, which sit at the same depth.
//
// Skipped entirely when PORT is set, i.e. on a hosting platform. There, configuration is
// whatever the platform injected and nothing else — a stray .env reaching the server
// should not be able to quietly override it. This is not hypothetical: a .env carrying the
// local `API_HOST=127.0.0.1` would bind the service to loopback, at which point it starts
// cleanly, logs nothing wrong, and fails its health check with no explanation.
if (!process.env.PORT) {
  dotenv.config({ path: join(here, "..", "..", "..", ".env") });
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

/**
 * A secret has no safe fallback: a wrong-but-plausible default is worse than
 * nothing, because it fails far from the cause. Returns undefined when unset —
 * validateConfig() below turns that into a readable startup error.
 *
 * The literal placeholders from .env.example count as unset. A freshly copied
 * .env otherwise sails past a presence check and fails much later as an opaque
 * 401 from OpenAI.
 */
const PLACEHOLDER_VALUES = new Set(["sk-your-openai-key-here"]);

function secret(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "" || PLACEHOLDER_VALUES.has(value)) return undefined;
  return value;
}

export const config = {
  /**
   * Port to listen on.
   *
   * `PORT` comes first because that is what hosting platforms inject — Render, Fly, Heroku
   * and friends all assign a port and expect the process to use it. Binding anything else
   * means the platform's health check never gets an answer and the deploy is marked
   * unhealthy with no error in the application log, which is a miserable thing to debug.
   * `API_PORT` remains for local use, where it is the more descriptive name.
   */
  port: Number(process.env.PORT || optional("API_PORT", "3001")),

  /**
   * Address to bind.
   *
   * Loopback is right locally — it keeps a development server off the office network.
   * In a container it is wrong: the platform's proxy reaches the process from outside the
   * loopback interface, so binding 127.0.0.1 makes the service unreachable however healthy
   * it is. `PORT` being set is the reliable signal that we are on such a platform.
   */
  host: optional("API_HOST", process.env.PORT ? "0.0.0.0" : "127.0.0.1"),

  nodeEnv: optional("NODE_ENV", "development"),
  /** Allowed origin for the web app during local dev. */
  webOrigin: optional("WEB_ORIGIN", "http://localhost:3000"),
  /** PostgreSQL + pgvector connection string (Feature 3). */
  databaseUrl: optional("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/innersun"),

  /**
   * Whether to serve POST /chat (Feature 17).
   *
   * On by default, because that endpoint is the product. It is switched OFF on the hosted
   * admin instance, where the only job is letting researchers author Care Patterns: an
   * open, unauthenticated, token-spending chat endpoint on the public internet is the one
   * thing that deployment must not create. With it off, the hosted service cannot run up
   * an OpenAI bill — its sole upstream call is one embedding when someone clicks Save.
   * Feature 21 turns it back on behind the abuse protection Feature 20 adds.
   */
  enableChatRoutes: optional("ENABLE_CHAT_ROUTES", "true").toLowerCase() !== "false",

  /**
   * OpenAI (Feature 4). The key is read here and nowhere else, and never leaves
   * this process — the browser talks to our /chat endpoint, not to OpenAI.
   */
  openai: {
    apiKey: secret("OPENAI_API_KEY"),
    /**
     * Override the OpenAI endpoint. Unset in normal use; set it to point at an
     * Azure/OpenAI-compatible gateway, or at a local stub when testing the
     * orchestrator without spending tokens.
     */
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
    /** Counseling replies — the quality-sensitive call (see PLAN Feature 8 tiering). */
    replyModel: optional("OPENAI_MODEL_REPLY", "gpt-4o"),
    /** Classify / normalize / summarize — the cheap calls (Features 7–8). */
    utilityModel: optional("OPENAI_MODEL_UTILITY", "gpt-4o-mini"),
    /** Care Pattern embeddings (Feature 6). */
    embeddingModel: optional("OPENAI_MODEL_EMBEDDING", "text-embedding-3-small"),
    /** Cap on reply length. Cost control; tuned properly in Feature 8. */
    maxReplyTokens: Number(optional("OPENAI_MAX_REPLY_TOKENS", "600")),
    /** Give up on a slow upstream rather than holding the request open. */
    timeoutMs: Number(optional("OPENAI_TIMEOUT_MS", "30000")),
  },

  /**
   * Care Pattern retrieval — the RAG knobs (Feature 7).
   *
   * These are configuration rather than constants because the right values depend on the
   * knowledge base, and the knowledge base is the researcher's, not ours. Every number here
   * is calibrated against real content by `npm run retrieval:calibrate`, which is the only
   * honest way to set them — see docs/PLAN.md Feature 7.
   */
  retrieval: {
    /**
     * Similarity a pattern must reach before its guidance is put in front of a student.
     *
     * Measured, not guessed — `npm run retrieval:calibrate` ran 18 labelled cases through
     * this exact pipeline against the starter library: correct matches scored 0.61-0.81,
     * messages the library does not cover scored 0.46 and below. 0.54 is the midpoint of
     * that gap: it applied all 12 correct matches and none of the 6 uncovered ones.
     *
     * Absolute cosine values are specific to the embedding model AND to how the patterns
     * are worded, so this number does not travel. docs/ARCHITECTURE.md's original "start
     * around 0.7-0.8" would have rejected half the correct matches — silently, with every
     * reply still looking fine. Re-run the calibration when the library changes materially.
     */
    relevanceFloor: Number(optional("CARE_PATTERN_RELEVANCE_FLOOR", "0.54")),
    /** How many patterns may be blended into one reply, at most. */
    topN: Number(optional("CARE_PATTERN_TOP_N", "3")),
    /**
     * How many of the student's recent messages feed the match query. Only theirs — see
     * the note on assistant turns in retrieval.ts.
     */
    matchWindow: Number(optional("CARE_PATTERN_MATCH_WINDOW", "4")),
    /**
     * Below this many characters of student text, skip retrieval entirely.
     *
     * A cost guard, not a relevance gate: "hi" cannot match anything, and the floor would
     * reject it anyway — this just avoids spending two upstream calls to find that out.
     * Deliberately low, because the floor is the real decision and a false skip is worse
     * than a wasted fraction of a cent.
     */
    minSignalChars: Number(optional("CARE_PATTERN_MIN_SIGNAL_CHARS", "12")),
  },
} as const;

export const isProduction = config.nodeEnv === "production";

/**
 * Checks configuration that must be right before the server accepts traffic.
 * Returns human-readable problems; an empty array means the config is usable.
 * Called from start() so a misconfiguration is a clear message, not a stack
 * trace at import time or a confusing failure on the first real request.
 */
export function validateConfig(): string[] {
  const problems: string[] = [];

  if (!config.openai.apiKey) {
    problems.push(
      "OPENAI_API_KEY is missing (or still the .env.example placeholder). " +
        "Set a real key in the repo-root .env — POST /chat cannot work without it.",
    );
  }
  if (!Number.isFinite(config.port) || config.port <= 0) {
    problems.push(
      `Port is not a valid number: PORT=${process.env.PORT ?? "(unset)"}, API_PORT=${process.env.API_PORT ?? "(unset)"}`,
    );
  }
  if (!Number.isFinite(config.openai.maxReplyTokens) || config.openai.maxReplyTokens <= 0) {
    problems.push(`OPENAI_MAX_REPLY_TOKENS must be a positive number: ${process.env.OPENAI_MAX_REPLY_TOKENS}`);
  }
  if (!Number.isFinite(config.openai.timeoutMs) || config.openai.timeoutMs <= 0) {
    problems.push(`OPENAI_TIMEOUT_MS must be a positive number: ${process.env.OPENAI_TIMEOUT_MS}`);
  }

  // A floor outside 0-1 is not a stricter setting, it is a broken one: above 1 nothing can
  // ever match and every student silently gets general replies, below 0 everything matches
  // and unrelated guidance reaches people. Both fail invisibly, so they fail at startup.
  const { relevanceFloor, topN, matchWindow, minSignalChars } = config.retrieval;
  if (!Number.isFinite(relevanceFloor) || relevanceFloor < 0 || relevanceFloor > 1) {
    problems.push(
      `CARE_PATTERN_RELEVANCE_FLOOR must be a cosine similarity between 0 and 1: ${process.env.CARE_PATTERN_RELEVANCE_FLOOR}`,
    );
  }
  if (!Number.isInteger(topN) || topN <= 0) {
    problems.push(`CARE_PATTERN_TOP_N must be a positive whole number: ${process.env.CARE_PATTERN_TOP_N}`);
  }
  if (!Number.isInteger(matchWindow) || matchWindow <= 0) {
    problems.push(`CARE_PATTERN_MATCH_WINDOW must be a positive whole number: ${process.env.CARE_PATTERN_MATCH_WINDOW}`);
  }
  if (!Number.isFinite(minSignalChars) || minSignalChars < 0) {
    problems.push(
      `CARE_PATTERN_MIN_SIGNAL_CHARS must be zero or a positive number: ${process.env.CARE_PATTERN_MIN_SIGNAL_CHARS}`,
    );
  }

  return problems;
}
