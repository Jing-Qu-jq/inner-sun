// Drops and recreates the public schema, then re-applies all migrations and reseeds.
// Useful for a clean slate without recreating the Docker volume.
//
// The most destructive command in the repo: it discards every row, including the
// researcher-authored Care Patterns. Guarded to local databases only — see lib/guard.ts.

import { createClient } from "./lib/pg.js";
import { fail } from "./lib/cli.js";
import { getDatabaseUrl } from "./lib/env.js";
import { assertLocalDatabase } from "./lib/guard.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

async function dropSchema(): Promise<void> {
  const client = createClient(getDatabaseUrl());
  await client.connect();
  try {
    process.stdout.write("Dropping public schema ... ");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    console.log("done");
  } finally {
    await client.end();
  }
}

async function reset(): Promise<void> {
  assertLocalDatabase(getDatabaseUrl(), "drop and recreate the schema");
  await dropSchema();
  await migrate();
  await seed();
  console.log("Reset complete.");
}

reset().catch((err) => fail("Reset failed", err));
