// Applies db/migrations/*.sql in filename order, each in its own transaction, and
// records applied files in a schema_migrations table so re-runs are idempotent.
// Reproducible from scratch: on a fresh database it creates the full schema.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { fail } from "./lib/cli.js";
import { getDatabaseUrl } from "./lib/env.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

export async function migrate(): Promise<void> {
  const client = new pg.Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    const appliedRows = await client.query<{ filename: string }>("select filename from schema_migrations");
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), "utf8");
      process.stdout.write(`  applying ${file} ... `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log("done");
        count++;
      } catch (err) {
        await client.query("rollback");
        console.log("failed");
        throw err;
      }
    }

    console.log(count === 0 ? "Schema up to date (no new migrations)." : `Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

// Run when invoked directly (not when imported by reset.ts).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate().catch((err) => fail("Migration failed", err));
}
