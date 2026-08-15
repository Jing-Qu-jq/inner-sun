// Deterministic PLACEHOLDER embeddings — a stable pseudo-vector derived from the text,
// so the same input always yields the same output.
//
// These are NOT semantic. Two patterns about the same topic get vectors as unrelated as
// two about different ones, so ranking against them is arbitrary. That is why rows seeded
// this way are flagged `needs_embedding` and why `db:verify` refuses to run while any
// exist — a plausible-looking ranking over noise is worse than a clear refusal.
//
// Feature 6 makes real text-embedding-3-small vectors the default (see embedding.ts).
// This module survives as the `db:seed --fake` escape hatch, so the database can still
// be stood up from scratch with no OpenAI key — a Feature 3 property worth keeping.
// Rows seeded this way are recorded as embedding_model='placeholder' and flagged
// needs_embedding, so `db:reembed --stale` upgrades them to real vectors later.

import { EMBEDDING_DIM } from "./vector.js";

export { EMBEDDING_DIM } from "./vector.js";

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
