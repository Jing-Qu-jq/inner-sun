import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));

// Load the repo-root .env (db/scripts/lib -> ../../../.env). Scripts run with the
// db/ workspace as cwd, so we resolve the root .env explicitly rather than by cwd.
dotenv.config({ path: join(here, "..", "..", "..", ".env") });

/** Default connection string — matches db/docker-compose.yml and .env.example. */
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/innersun";

/** The Postgres connection string, from DATABASE_URL or the local-dev default. */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  return url === undefined || url === "" ? DEFAULT_DATABASE_URL : url;
}

/**
 * Connection string for the *hosted* database, used only by `db:pull:patterns` to copy
 * the researcher's Care Patterns down into the local one. Deliberately a separate
 * variable from DATABASE_URL: repointing DATABASE_URL at production to fetch content is
 * exactly the mistake that makes `db:reset` catastrophic (see lib/guard.ts).
 */
export function getRemoteDatabaseUrl(): string | undefined {
  const url = process.env.REMOTE_DATABASE_URL;
  return url === undefined || url === "" ? undefined : url;
}

/**
 * The literal placeholders from .env.example count as unset. Copied from the API's
 * config.ts for the same reason it exists there: a freshly copied .env otherwise sails
 * past a presence check and dies much later as an opaque 401 from OpenAI.
 */
const PLACEHOLDER_VALUES = new Set(["sk-your-openai-key-here"]);

/** The OpenAI key, or undefined when unset/placeholder. Callers report that themselves. */
export function getOpenAiApiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY;
  if (value === undefined || value === "" || PLACEHOLDER_VALUES.has(value)) {
    return undefined;
  }
  return value;
}

/**
 * Embedding model, matching the API's OPENAI_MODEL_EMBEDDING so both halves of the
 * system embed the same way. A query embedded by one model and a pattern embedded by
 * another produce meaningless similarity scores, so this must not drift.
 */
export function getEmbeddingModel(): string {
  const value = process.env.OPENAI_MODEL_EMBEDDING;
  return value === undefined || value === "" ? "text-embedding-3-small" : value;
}

/** Optional OpenAI-compatible endpoint override (Azure, a gateway, or a local stub). */
export function getOpenAiBaseUrl(): string | undefined {
  return process.env.OPENAI_BASE_URL || undefined;
}
