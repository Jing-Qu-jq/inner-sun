// Drops and recreates the public schema, then re-applies all migrations and reseeds.
// Useful for a clean slate without recreating the Docker volume. Destructive.

import pg from "pg";
import { fail } from "./lib/cli.js";
import { getDatabaseUrl } from "./lib/env.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

async function dropSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: getDatabaseUrl() });
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
  await dropSchema();
  await migrate();
  await seed();
  console.log("Reset complete.");
}

reset().catch((err) => fail("Reset failed", err));
