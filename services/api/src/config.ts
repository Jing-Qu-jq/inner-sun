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

export const config = {
  /** Port the API listens on locally. */
  port: Number(optional("API_PORT", "3001")),
  host: optional("API_HOST", "127.0.0.1"),
  nodeEnv: optional("NODE_ENV", "development"),
  /** Allowed origin for the web app during local dev. */
  webOrigin: optional("WEB_ORIGIN", "http://localhost:3000"),
  /** PostgreSQL + pgvector connection string (Feature 3). */
  databaseUrl: optional("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/innersun"),
} as const;

export const isProduction = config.nodeEnv === "production";
