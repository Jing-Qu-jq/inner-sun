import pg from "pg";
import { config } from "./config.js";

/**
 * Shared PostgreSQL connection pool for the API (Feature 3).
 * The database holds Care Patterns + their embeddings, users, conversations, and more.
 */
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** Lightweight connectivity check used by the /health endpoint. */
export async function isDbReachable(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}
