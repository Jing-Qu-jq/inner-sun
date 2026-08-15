// Refuses to run destructive scripts against a database that is not on this machine.
//
// Why this exists: `reset.ts` runs `drop schema public cascade`, and `seed.ts` upserts
// over the starter patterns by fixed UUID. Both read DATABASE_URL. While the only
// database was a local Docker container that was merely inconvenient — but from Feature
// 17 onward a hosted database holds the researcher-authored knowledge base, and a
// mistakenly-pointed .env would destroy or overwrite her work in one command, with no
// undo and no confirmation prompt. The blast radius changed, so the scripts must too.
//
// Deliberately fail-closed: a connection string we cannot parse is treated as remote.
// Being wrongly blocked costs one flag; being wrongly allowed costs the knowledge base.

import { hasFlag } from "./args.js";

/** Hostnames that mean "this machine". */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** The flag that consciously overrides the guard, e.g. when first seeding production. */
export const ALLOW_REMOTE_FLAG = "allow-remote";

/** The host a connection string points at, or undefined if it cannot be determined. */
export function databaseHost(connectionString: string): string | undefined {
  try {
    return new URL(connectionString).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** True only when the connection string demonstrably points at this machine. */
export function isLocalDatabase(connectionString: string): boolean {
  const host = databaseHost(connectionString);
  return host !== undefined && LOCAL_HOSTNAMES.has(host);
}

/**
 * Throws unless the target database is local or `--allow-remote` was passed.
 * `operation` is what would happen, phrased for a human: "drop and recreate the schema".
 */
export function assertLocalDatabase(connectionString: string, operation: string): void {
  if (isLocalDatabase(connectionString)) {
    return;
  }

  const host = databaseHost(connectionString) ?? "an unparseable DATABASE_URL";

  if (hasFlag(ALLOW_REMOTE_FLAG)) {
    console.warn(`\n⚠️  About to ${operation} on a NON-LOCAL database: ${host}`);
    console.warn(`   Proceeding because --${ALLOW_REMOTE_FLAG} was passed.\n`);
    return;
  }

  throw new Error(
    `Refusing to ${operation} on a non-local database.\n` +
      `  DATABASE_URL points at: ${host}\n\n` +
      "This guard exists because the hosted database holds the researcher-authored Care\n" +
      "Patterns, and this command would destroy or overwrite them with no undo.\n\n" +
      "  • Normal local work: point DATABASE_URL back at localhost.\n" +
      "  • To copy hosted patterns down instead: npm run db:pull:patterns\n" +
      `  • If you really mean it: re-run with --${ALLOW_REMOTE_FLAG}`,
  );
}
