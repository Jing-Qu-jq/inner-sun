// Feature 3 acceptance check: proves cosine top-N vector search works against seed rows.
//
// Strategy: embed one seed pattern's own `situation` with the SAME deterministic function
// used to seed it, then run a pgvector cosine top-N query. That pattern must come back as
// the #1 hit with similarity ≈ 1.0, which shows the vector column, operator, and index work.

import pg from "pg";
import { sampleCarePatterns } from "../seeds/sample-care-patterns.js";
import { fail } from "./lib/cli.js";
import { getDatabaseUrl } from "./lib/env.js";
import { fakeEmbedding, toVectorLiteral } from "./lib/fake-embedding.js";

const TOP_N = 3;

async function verify(): Promise<void> {
  const target = sampleCarePatterns[0];
  const queryVec = toVectorLiteral(fakeEmbedding(target.situation));

  const client = new pg.Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; title: string; similarity: number }>(
      `select id, title, 1 - (embedding <=> $1::vector) as similarity
         from care_patterns
        where embedding is not null and is_active
        order by embedding <=> $1::vector
        limit $2`,
      [queryVec, TOP_N],
    );

    if (rows.length === 0) {
      throw new Error("No embedded care_patterns found — run `npm run db:seed` first.");
    }

    console.log(`Cosine top-${TOP_N} for query "${target.title}":`);
    rows.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title}  (similarity ${Number(r.similarity).toFixed(4)})`);
    });

    const top = rows[0];
    if (top.id !== target.id) {
      throw new Error(`Expected "${target.title}" as the top match but got "${top.title}".`);
    }
    if (Number(top.similarity) < 0.99) {
      throw new Error(`Top similarity ${Number(top.similarity).toFixed(4)} is lower than expected (~1.0).`);
    }

    console.log("\nOK: pgvector cosine top-N search works against seed rows.");
  } finally {
    await client.end();
  }
}

verify().catch((err) => fail("Verify failed", err));
