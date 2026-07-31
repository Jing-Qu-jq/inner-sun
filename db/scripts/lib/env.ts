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
