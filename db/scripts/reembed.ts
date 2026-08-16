// Re-embeds Care Pattern `situation` text (Feature 6 AC 4).
//
// Two jobs:
//   npm run db:reembed              every pattern — use after changing the embedding model
//   npm run db:reembed -- --stale   only rows that need it: never embedded, flagged
//                                   needs_embedding by a failed save, or carrying a vector
//                                   from a different model (including --fake placeholders)
//
// Not guarded to local databases. Unlike reset and seed this destroys no authored content:
// it only regenerates derived vectors, and re-embedding the hosted database is precisely
// what AC 4 exists for. The target host is printed so it is never ambiguous which one.

import { createClient } from "./lib/pg.js";
import { hasFlag } from "./lib/args.js";
import { fail } from "./lib/cli.js";
import { embedTexts } from "./lib/embedding.js";
import { databaseHost } from "./lib/guard.js";
import { getDatabaseUrl, getEmbeddingModel } from "./lib/env.js";
import { toVectorLiteral } from "./lib/vector.js";

// Bounded so a large knowledge base cannot build one enormous transaction, and so
// progress is visible rather than a single long pause.
const BATCH_SIZE = 32;

interface PatternToEmbed {
  id: string;
  title: string;
  situation: string;
}

async function reembed(): Promise<void> {
  const staleOnly = hasFlag("stale");
  const model = getEmbeddingModel();
  const databaseUrl = getDatabaseUrl();

  const client = createClient(databaseUrl);
  await client.connect();

  try {
    console.log(`Target: ${databaseHost(databaseUrl) ?? "unknown host"}  ·  model: ${model}`);

    const { rows } = await client.query<PatternToEmbed>(
      `select id, title, situation
         from care_patterns
        where ${staleOnly ? "(embedding is null or needs_embedding or embedding_model is distinct from $1)" : "true"}
        order by created_at`,
      staleOnly ? [model] : [],
    );

    if (rows.length === 0) {
      console.log(staleOnly ? "Nothing stale — every pattern is embedded with the current model." : "No care patterns found.");
      return;
    }

    console.log(`Re-embedding ${rows.length} pattern(s)${staleOnly ? " (stale only)" : ""} ...`);

    let done = 0;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const { vectors } = await embedTexts(batch.map((r) => r.situation));

      // One transaction per batch: an interrupted run leaves committed batches correct
      // rather than rolling back work already paid for.
      await client.query("begin");
      try {
        for (let i = 0; i < batch.length; i++) {
          await client.query(
            `update care_patterns
                set embedding = $2::vector,
                    embedding_model = $3,
                    embedded_at = now(),
                    needs_embedding = false
              where id = $1`,
            [batch[i].id, toVectorLiteral(vectors[i]), model],
          );
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }

      done += batch.length;
      console.log(`  ${done}/${rows.length}`);
    }

    console.log(`\nOK: ${done} pattern(s) re-embedded with ${model}.`);
  } finally {
    await client.end();
  }
}

reembed().catch((err) => fail("Re-embed failed", err));
