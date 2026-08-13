import pg from "pg";
import { config } from "./config.js";

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
