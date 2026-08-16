import pg from "pg";
import type { PoolClient, QueryResultRow } from "pg";
import { config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * Shared PostgreSQL connection pool for the API (Feature 3).
 * The database holds Care Patterns + their embeddings, users, conversations, and more.
 */
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// An idle pooled client can fail on its own (the database restarted, the network
// dropped). pg forwards that as an 'error' event on the pool, and an unhandled
// 'error' event terminates the Node process — so without this listener the whole
// API dies whenever the database goes away, instead of reporting db: "down".
// The pool discards the broken client itself; we only need to log and stay alive.
pool.on("error", (err) => {
  console.error("[db] idle client error — the pool will discard it:", err.message);
});

/** Lightweight connectivity check used by the /health endpoint. */
export async function isDbReachable(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

/** What a caller sees when the database is unreachable. Never the pg text: a pg error
 *  message can quote row values, so it stays in the log as `cause`. */
const STORAGE_UNAVAILABLE = "We couldn't reach the database. Please try again in a moment.";

/**
 * Run a query, turning a database outage into a deliberate 503 rather than an unplanned
 * 500. Everything that touches Postgres should go through here — a stopped container is a
 * "come back shortly" condition, and reporting it as an internal error sends whoever is
 * debugging to look for a bug in the handler instead of at the database.
 */
export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  try {
    return await pool.query<T>(text, values);
  } catch (err) {
    throw new AppError(503, "storage_unavailable", STORAGE_UNAVAILABLE, { cause: err });
  }
}

/** Same treatment for checking out a client, which transactions need. */
export async function dbConnect(): Promise<PoolClient> {
  try {
    return await pool.connect();
  } catch (err) {
    throw new AppError(503, "storage_unavailable", STORAGE_UNAVAILABLE, { cause: err });
  }
}
