// Feature 6 acceptance check: proves Care Pattern retrieval works *semantically*.
//
// Feature 3's version embedded a seed pattern's own `situation` with the same
// deterministic function that produced the stored vector, so a top hit at similarity 1.0
// only demonstrated that the column, operator and index were wired up — it would have
// passed just as happily if the vectors meant nothing, because they did.
//
// This version asks the real question: given something a *student* might type, in their
// own words, does the right researcher-authored pattern come back first? That is the
// behavior Feature 7 depends on, and nothing but real embeddings can satisfy it.

import { createClient } from "./lib/pg.js";
import { fail } from "./lib/cli.js";
import { embedText } from "./lib/embedding.js";
import { getDatabaseUrl, getEmbeddingModel } from "./lib/env.js";
import { toVectorLiteral } from "./lib/vector.js";

const TOP_N = 3;

/** Similarity floor for a genuine match. Paraphrases land well below the 1.0 of identical
 *  text, so this is a sanity bound against a broken pipeline, not a relevance threshold —
 *  Feature 7 owns the real, configurable one. */
const MIN_TOP_SIMILARITY = 0.2;

interface Case {
  /** Phrased the way a student would write it, not the way the pattern is worded. */
  query: string;
  expectedId: string;
  expectedTitle: string;
}

const CASES: Case[] = [
  {
    query: "I can't stop thinking about my family back home and I really miss the food I grew up with",
    expectedId: "11111111-1111-4111-8111-111111111111",
    expectedTitle: "Homesickness & cultural adjustment",
  },
  {
    query: "my visa paperwork is due next month and I'm terrified I'll get something wrong and have to leave",
    expectedId: "44444444-4444-4444-8444-444444444444",
    expectedTitle: "Visa & immigration status anxiety",
  },
  {
    query: "everyone in my cohort seems so much smarter than me, I never say anything in seminars",
    expectedId: "99999999-9999-4999-8999-999999999999",
    expectedTitle: "Imposter feelings in a competitive program",
  },
  {
    query: "I stay up until 3am to call my parents and then I can't concentrate in my 9am lecture",
    expectedId: "88888888-8888-4888-8888-888888888888",
    expectedTitle: "Sleep disruption & living across time zones",
  },
];

interface Hit {
  id: string;
  title: string;
  similarity: number;
}

async function verify(): Promise<void> {
  const client = createClient(getDatabaseUrl());
  await client.connect();

  try {
    const model = getEmbeddingModel();

    // A placeholder vector is random noise. Ranking would be arbitrary and the failure
    // would look like a retrieval bug, so say what it actually is.
    const { rows: health } = await client.query<{ total: string; unusable: string }>(
      `select count(*) as total,
              count(*) filter (where embedding is null or needs_embedding
                                  or embedding_model is distinct from $1) as unusable
         from care_patterns
        where status = 'published'`,
      [model],
    );
    const total = Number(health[0].total);
    const unusable = Number(health[0].unusable);

    if (total === 0) {
      throw new Error("No published care_patterns found — run `npm run db:seed` first.");
    }
    if (unusable > 0) {
      throw new Error(
        `${unusable} of ${total} published pattern(s) lack a usable ${model} embedding ` +
          "(never embedded, flagged after a failed save, or seeded with --fake placeholders).\n" +
          "Semantic ranking is meaningless until they are embedded for real:\n" +
          "  npm run db:reembed -- --stale",
      );
    }

    console.log(`Semantic retrieval check — ${total} published pattern(s), model ${model}\n`);

    const failures: string[] = [];

    for (const testCase of CASES) {
      const { vector } = await embedText(testCase.query);

      const { rows } = await client.query<Hit>(
        `select id, title, 1 - (embedding <=> $1::vector) as similarity
           from care_patterns
          where embedding is not null and status = 'published'
          order by embedding <=> $1::vector
          limit $2`,
        [toVectorLiteral(vector), TOP_N],
      );

      const top = rows[0];
      const margin = rows.length > 1 ? Number(top.similarity) - Number(rows[1].similarity) : Number(top.similarity);
      const ok = top.id === testCase.expectedId && Number(top.similarity) >= MIN_TOP_SIMILARITY;

      console.log(`${ok ? "✓" : "✗"} "${testCase.query}"`);
      rows.forEach((r, i) => {
        console.log(`     ${i + 1}. ${r.title}  (${Number(r.similarity).toFixed(4)})`);
      });
      console.log(`     margin over #2: ${margin.toFixed(4)}\n`);

      if (top.id !== testCase.expectedId) {
        failures.push(`Expected "${testCase.expectedTitle}" first for "${testCase.query}" but got "${top.title}".`);
      } else if (Number(top.similarity) < MIN_TOP_SIMILARITY) {
        failures.push(
          `"${testCase.expectedTitle}" ranked first but at only ${Number(top.similarity).toFixed(4)} ` +
            `similarity (floor ${MIN_TOP_SIMILARITY}) — the embeddings look wrong.`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${CASES.length} case(s) failed:\n  - ${failures.join("\n  - ")}`);
    }

    console.log(`OK: all ${CASES.length} queries retrieved the right Care Pattern first.`);
  } finally {
    await client.end();
  }
}

verify().catch((err) => fail("Verify failed", err));
