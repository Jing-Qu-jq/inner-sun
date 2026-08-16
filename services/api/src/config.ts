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
dotenv.config({ path: join(here, "..", "..", "..", ".env") });

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
  /** Port the API listens on locally. */
  port: Number(optional("API_PORT", "3001")),
  host: optional("API_HOST", "127.0.0.1"),
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
    problems.push(`API_PORT is not a valid port number: ${process.env.API_PORT}`);
  }
  if (!Number.isFinite(config.openai.maxReplyTokens) || config.openai.maxReplyTokens <= 0) {
    problems.push(`OPENAI_MAX_REPLY_TOKENS must be a positive number: ${process.env.OPENAI_MAX_REPLY_TOKENS}`);
  }
  if (!Number.isFinite(config.openai.timeoutMs) || config.openai.timeoutMs <= 0) {
    problems.push(`OPENAI_TIMEOUT_MS must be a positive number: ${process.env.OPENAI_TIMEOUT_MS}`);
  }

  return problems;
}
