// Vector helpers shared by the real embedder (embedding.ts) and the placeholder
// generator (fake-embedding.ts). Neither owns these: the dimension is a property of
// the `vector(1536)` column in db/migrations/0001_init.sql, not of either producer.

/** Dimension of the `care_patterns.embedding` column — OpenAI text-embedding-3-small. */
export const EMBEDDING_DIM = 1536;

/** Format a number[] as a pgvector literal, e.g. "[0.1,0.2,...]" for `$1::vector`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
