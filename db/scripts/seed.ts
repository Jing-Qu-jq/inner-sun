// Loads the starter Care Patterns + canned responses (Feature 6).
//
// Idempotent in two senses. Rows upsert on their fixed UUIDs, and — because embedding
// costs a network call and real money — a pattern is only re-embedded when it actually
// needs it. Running `db:seed` twice in a row makes zero embedding calls the second time.
//
// `--fake` seeds deterministic placeholder vectors instead, so the database can still be
// stood up from scratch with no OpenAI key (a Feature 3 property worth keeping). Those
// rows are recorded as embedding_model='placeholder' and flagged needs_embedding, so
// `npm run db:reembed -- --stale` upgrades them to real vectors later.

import { pathToFileURL } from "node:url";
import pg from "pg";
import { sampleCannedResponses, sampleCarePatterns } from "../seeds/sample-care-patterns.js";
import type { SampleCarePattern } from "../seeds/sample-care-patterns.js";
import { hasFlag } from "./lib/args.js";
import { fail } from "./lib/cli.js";
import { PLACEHOLDER_MODEL, embedTexts } from "./lib/embedding.js";
import { getDatabaseUrl, getEmbeddingModel } from "./lib/env.js";
import { assertLocalDatabase } from "./lib/guard.js";
import { fakeEmbedding } from "./lib/fake-embedding.js";
import { toVectorLiteral } from "./lib/vector.js";

interface ExistingRow {
  id: string;
  situation: string;
  embedding_model: string | null;
  needs_embedding: boolean;
  has_embedding: boolean;
}

/** What this run will store for one pattern's vector — or null to keep what is there. */
interface EmbeddingUpdate {
  vector: string | null;
  model: string | null;
  embeddedAt: string | null;
  needsEmbedding: boolean;
}

/**
 * A stored vector is reusable only if it was produced from the *current* text by the
 * *current* model and the last attempt succeeded. Anything else and the row's embedding
 * no longer describes its situation, which is the silent failure this feature prevents.
 */
function needsEmbedding(pattern: SampleCarePattern, existing: ExistingRow | undefined, model: string): boolean {
  if (!existing || !existing.has_embedding) return true;
  if (existing.situation !== pattern.situation) return true;
  if (existing.embedding_model !== model) return true;
  return existing.needs_embedding;
}

export async function seed(): Promise<void> {
  const useFake = hasFlag("fake");
  const client = new pg.Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const model = useFake ? PLACEHOLDER_MODEL : getEmbeddingModel();

    // Read current state first so we can tell which patterns actually changed.
    const { rows } = await client.query<ExistingRow>(
      `select id, situation, embedding_model, needs_embedding, (embedding is not null) as has_embedding
         from care_patterns
        where id = any($1::uuid[])`,
      [sampleCarePatterns.map((p) => p.id)],
    );
    const existingById = new Map(rows.map((r) => [r.id, r]));

    const stale = sampleCarePatterns.filter((p) => needsEmbedding(p, existingById.get(p.id), model));
    const updates = new Map<string, EmbeddingUpdate>();

    if (stale.length > 0) {
      const embeddedAt = new Date().toISOString();

      if (useFake) {
        for (const p of stale) {
          updates.set(p.id, {
            vector: toVectorLiteral(fakeEmbedding(p.situation)),
            model: PLACEHOLDER_MODEL,
            embeddedAt,
            // A placeholder vector is not a real embedding, so the row stays flagged
            // even though this run "succeeded" — db:reembed --stale will pick it up.
            needsEmbedding: true,
          });
        }
        console.log(`Generated ${stale.length} PLACEHOLDER embedding(s) (--fake).`);
      } else {
        process.stdout.write(`Embedding ${stale.length} situation(s) with ${model} ... `);
        const { vectors } = await embedTexts(stale.map((p) => p.situation));
        console.log("done");
        stale.forEach((p, i) => {
          updates.set(p.id, {
            vector: toVectorLiteral(vectors[i]),
            model,
            embeddedAt,
            needsEmbedding: false,
          });
        });
      }
    }

    for (const p of sampleCarePatterns) {
      // No update means the stored vector is still correct; null tells the upsert to
      // keep it rather than overwrite it.
      const update = updates.get(p.id) ?? { vector: null, model: null, embeddedAt: null, needsEmbedding: false };

      await client.query(
        `insert into care_patterns
           (id, title, situation, signals, strategies, avoid, escalation, source_refs, locale_notes,
            embedding, embedding_model, embedded_at, needs_embedding)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::vector, $11, $12::timestamptz, $13)
         on conflict (id) do update set
           title = excluded.title,
           situation = excluded.situation,
           signals = excluded.signals,
           strategies = excluded.strategies,
           avoid = excluded.avoid,
           escalation = excluded.escalation,
           source_refs = excluded.source_refs,
           locale_notes = excluded.locale_notes,
           embedding = coalesce(excluded.embedding, care_patterns.embedding),
           embedding_model = coalesce(excluded.embedding_model, care_patterns.embedding_model),
           embedded_at = coalesce(excluded.embedded_at, care_patterns.embedded_at),
           needs_embedding = excluded.needs_embedding`,
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
          update.vector,
          update.model,
          update.embeddedAt,
          update.needsEmbedding,
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

    const reused = sampleCarePatterns.length - stale.length;
    console.log(
      `Seeded ${sampleCarePatterns.length} care pattern(s) ` +
        `(${stale.length} embedded, ${reused} reused existing embedding) ` +
        `and ${sampleCannedResponses.length} canned response(s).`,
    );
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Guarded: this upserts over the starter patterns by fixed UUID, so against the hosted
  // database it would overwrite whatever the researcher has edited them into.
  try {
    assertLocalDatabase(getDatabaseUrl(), "overwrite the starter Care Patterns");
  } catch (err) {
    fail("Seed refused", err);
  }
  seed().catch((err) => fail("Seed failed", err));
}
