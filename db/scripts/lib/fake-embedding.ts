// Deterministic PLACEHOLDER embeddings for Feature 3.
//
// Feature 3 only needs to prove that pgvector cosine search returns top-N against
// seed rows — it does NOT need real semantics and must not require an OpenAI key to
// stand up the database. So we derive a stable pseudo-embedding from the input text.
//
// The SAME text always yields the SAME vector, so verify.ts can embed a seed pattern's
// own situation and expect that pattern back as the top hit (similarity ≈ 1.0).
//
// Feature 6 replaces these with real text-embedding-3-small vectors.

export const EMBEDDING_DIM = 1536; // OpenAI text-embedding-3-small

/** Small, fast, stable string hash (FNV-1a 32-bit). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from the text hash. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic unit-length pseudo-embedding for `text` (L2-normalized so cosine
 * similarity is well-behaved). Placeholder only — see the file header.
 */
export function fakeEmbedding(text: string, dim: number = EMBEDDING_DIM): number[] {
  const rand = mulberry32(fnv1a(text));
  const vec = new Array<number>(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const v = rand() * 2 - 1; // [-1, 1)
    vec[i] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) {
    vec[i] = vec[i] / norm;
  }
  return vec;
}

/** Format a number[] as a pgvector literal, e.g. "[0.1,0.2,...]" for `$1::vector`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
