import { readFileSync } from "node:fs";
import pg from "pg";
import type { PoolClient, QueryResultRow } from "pg";
import { config } from "./config.js";
import { AppError } from "./errors.js";

/** Hostnames that mean "this machine", and so need no TLS. */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * `DATABASE_SSL_CA` is either the PEM text itself — which is what a hosting platform makes
 * easy, since it takes environment variables but not files — or a path to a file.
 */
function readCa(): string | undefined {
  const value = process.env.DATABASE_SSL_CA;
  if (!value) return undefined;
  if (value.includes("-----BEGIN CERTIFICATE-----")) return value;
  return readFileSync(value, "utf8");
}

/**
 * `pg` silently ignores an explicit `ssl` options object when the connection string
 * carries an `sslmode` parameter — and Supabase's copyable URI often does. Since we are
 * deciding TLS ourselves below, the parameter is removed so our choice actually applies.
 */
function stripSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sslmode")) return url;
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * TLS is decided here from the host rather than left to `pg` to infer. A hosted database
 * (Supabase) requires it; a local Docker container does not offer it.
 *
 * Supabase presents a certificate chained to its OWN CA, not a publicly trusted one, so
 * Node rejects it as "self-signed certificate in certificate chain" unless that CA is
 * supplied via DATABASE_SSL_CA (`prod-ca-2021.crt`, from Database Settings → SSL
 * Configuration). Verification stays ON: `rejectUnauthorized: false` is the usual
 * copy-paste response to that error and it quietly downgrades the connection to
 * encrypted-but-unverified, which anyone on the network path can sit in the middle of.
 *
 * Fails closed: a connection string we cannot parse is treated as remote, so the mistake
 * is a TLS handshake error rather than credentials sent in the clear.
 */
function poolConfig(): pg.PoolConfig {
  let hostname: string | undefined;
  try {
    hostname = new URL(config.databaseUrl).hostname || undefined;
  } catch {
    hostname = undefined;
  }

  if (hostname !== undefined && LOCAL_HOSTNAMES.has(hostname)) {
    return { connectionString: config.databaseUrl };
  }

  const connectionString = stripSslMode(config.databaseUrl);

  if (process.env.DATABASE_SSL_NO_VERIFY === "true") {
    console.warn(
      "[db] DATABASE_SSL_NO_VERIFY=true — connection encrypted but the server certificate " +
        "is NOT verified. Prefer DATABASE_SSL_CA with the provider's CA certificate.",
    );
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }

  const ca = readCa();
  return { connectionString, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true } };
}

/**
 * Shared PostgreSQL connection pool for the API (Feature 3).
 * The database holds Care Patterns + their embeddings, users, conversations, and more.
 */
export const pool = new pg.Pool(poolConfig());

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
