// Writes the live Care Patterns to db/seeds/exported-care-patterns.json.
//
//   npm run db:export:patterns             from DATABASE_URL (normally local)
//   npm run db:export:patterns -- --remote from REMOTE_DATABASE_URL (the hosted database)
//
// Why this exists: once the Feature 17 admin tool is live, the database — not the seed
// file — is the source of truth for the knowledge base, and that knowledge base is the
// product's core asset. Supabase's free tier keeps only limited backup history, so a
// committed export is the real safety net. Run it against production periodically and
// commit the result; the diff also doubles as a readable changelog of the researcher's work.
//
// Read-only, so it needs no guard.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hasFlag } from "./lib/args.js";
import { fail } from "./lib/cli.js";
import { CARE_PATTERN_COLUMNS, type CarePatternRow, toExported } from "./lib/care-patterns.js";
import { getDatabaseUrl, getRemoteDatabaseUrl } from "./lib/env.js";
import { databaseHost } from "./lib/guard.js";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "..", "seeds", "exported-care-patterns.json");

async function exportPatterns(): Promise<void> {
  const useRemote = hasFlag("remote");
  const databaseUrl = useRemote ? getRemoteDatabaseUrl() : getDatabaseUrl();

  if (useRemote && !databaseUrl) {
    throw new Error(
      "--remote needs REMOTE_DATABASE_URL set in the repo-root .env (the hosted database's " +
        "connection string). It is deliberately separate from DATABASE_URL so that reaching " +
        "production never means repointing the variable the destructive scripts read.",
    );
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`Exporting from ${databaseHost(databaseUrl!) ?? "unknown host"} ...`);

    // Retired patterns are included: a backup that silently drops them is not a backup.
    const { rows } = await client.query<CarePatternRow>(
      `select ${CARE_PATTERN_COLUMNS} from care_patterns order by created_at`,
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      patternCount: rows.length,
      note:
        "Care Patterns exported from the database, which is the source of truth once the " +
        "Feature 17 admin tool is in use. Embeddings are omitted — they are derived from " +
        "`situation` and regenerated with `npm run db:reembed`.",
      patterns: rows.map(toExported),
    };

    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`Wrote ${rows.length} pattern(s) to db/seeds/exported-care-patterns.json`);
  } finally {
    await client.end();
  }
}

exportPatterns().catch((err) => fail("Export failed", err));
