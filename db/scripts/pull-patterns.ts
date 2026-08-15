// Copies Care Patterns from the hosted database into the local one.
//
//   npm run db:pull:patterns
//
// Reads REMOTE_DATABASE_URL, writes to DATABASE_URL. This is how retrieval gets developed
// against the researcher's real content without pointing local development at production —
// which matters because a local dev session writes conversation rows, and `db:reset` would
// destroy her work outright. Pull the content down instead of reaching up to it.
//
// Vectors are not copied. They are derived from `situation`, and the local database may be
// on a different embedding model, so pulled rows are flagged `needs_embedding` and the
// follow-up command is printed. That keeps the OpenAI spend explicit rather than hidden
// inside a command whose name says nothing about embedding.

import pg from "pg";
import { fail } from "./lib/cli.js";
import { CARE_PATTERN_COLUMNS, type CarePatternRow } from "./lib/care-patterns.js";
import { getDatabaseUrl, getRemoteDatabaseUrl } from "./lib/env.js";
import { assertLocalDatabase, databaseHost } from "./lib/guard.js";

async function pullPatterns(): Promise<void> {
  const remoteUrl = getRemoteDatabaseUrl();
  const localUrl = getDatabaseUrl();

  if (!remoteUrl) {
    throw new Error(
      "REMOTE_DATABASE_URL is not set. Add the hosted database's connection string to the " +
        "repo-root .env — see .env.example.",
    );
  }

  // The destination is what gets written, so that is what must be local. Pulling *into*
  // the hosted database would overwrite the researcher's work with local copies.
  assertLocalDatabase(localUrl, "overwrite Care Patterns");

  const remote = new pg.Client({ connectionString: remoteUrl });
  const local = new pg.Client({ connectionString: localUrl });
  await remote.connect();
  await local.connect();

  try {
    console.log(`Pulling from ${databaseHost(remoteUrl) ?? "remote"} → ${databaseHost(localUrl) ?? "local"} ...`);

    const { rows } = await remote.query<CarePatternRow>(
      `select ${CARE_PATTERN_COLUMNS} from care_patterns order by created_at`,
    );

    if (rows.length === 0) {
      console.log("The hosted database has no Care Patterns yet.");
      return;
    }

    await local.query("begin");
    try {
      for (const r of rows) {
        await local.query(
          `insert into care_patterns
             (id, title, situation, signals, strategies, avoid, escalation, source_refs,
              locale_notes, is_active, needs_embedding)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, true)
           on conflict (id) do update set
             title = excluded.title,
             situation = excluded.situation,
             signals = excluded.signals,
             strategies = excluded.strategies,
             avoid = excluded.avoid,
             escalation = excluded.escalation,
             source_refs = excluded.source_refs,
             locale_notes = excluded.locale_notes,
             is_active = excluded.is_active,
             needs_embedding = true`,
          [
            r.id,
            r.title,
            r.situation,
            r.signals,
            r.strategies,
            r.avoid,
            r.escalation,
            r.source_refs,
            JSON.stringify(r.locale_notes ?? {}),
            r.is_active,
          ],
        );
      }
      await local.query("commit");
    } catch (err) {
      await local.query("rollback");
      throw err;
    }

    console.log(`Pulled ${rows.length} pattern(s).`);
    console.log("They are flagged as needing embeddings. To make them searchable locally:");
    console.log("  npm run db:reembed -- --stale");
  } finally {
    await remote.end();
    await local.end();
  }
}

pullPatterns().catch((err) => fail("Pull failed", err));
