// Loads the SAMPLE seed data (Care Patterns + canned responses) so vector search has
// rows to match against. Idempotent (upsert on stable keys). Embeddings here are
// deterministic PLACEHOLDERS — Feature 6 loads the real set and embeds via OpenAI.

import { pathToFileURL } from "node:url";
import pg from "pg";
import { sampleCannedResponses, sampleCarePatterns } from "../seeds/sample-care-patterns.js";
import { fail } from "./lib/cli.js";
import { getDatabaseUrl } from "./lib/env.js";
import { fakeEmbedding, toVectorLiteral } from "./lib/fake-embedding.js";

export async function seed(): Promise<void> {
  const client = new pg.Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    for (const p of sampleCarePatterns) {
      const embedding = toVectorLiteral(fakeEmbedding(p.situation)); // embed the `situation`
      await client.query(
        `insert into care_patterns
           (id, title, situation, signals, strategies, avoid, escalation, source_refs, locale_notes, embedding)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::vector)
         on conflict (id) do update set
           title = excluded.title,
           situation = excluded.situation,
           signals = excluded.signals,
           strategies = excluded.strategies,
           avoid = excluded.avoid,
           escalation = excluded.escalation,
           source_refs = excluded.source_refs,
           locale_notes = excluded.locale_notes,
           embedding = excluded.embedding`,
        [
          p.id,
          p.title,
          p.situation,
          p.signals,
          p.strategies,
          p.avoid,
          p.escalation,
          p.sourceRefs,
          JSON.stringify(p.localeNotes),
          embedding,
        ],
      );
    }

    for (const c of sampleCannedResponses) {
      await client.query(
        `insert into canned_responses (key, question, answer)
         values ($1, $2::jsonb, $3::jsonb)
         on conflict (key) do update set
           question = excluded.question,
           answer = excluded.answer`,
        [c.key, JSON.stringify(c.question), JSON.stringify(c.answer)],
      );
    }

    console.log(
      `Seeded ${sampleCarePatterns.length} care pattern(s) and ${sampleCannedResponses.length} canned response(s).`,
    );
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed().catch((err) => fail("Seed failed", err));
}
