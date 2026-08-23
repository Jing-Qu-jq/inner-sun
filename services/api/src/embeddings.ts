// Embeddings, server side (Features 7 and 17).
//
// Two callers, one code path on purpose. A researcher pressing Save embeds a pattern's
// `situation`; a student's turn embeds the match query built from their messages. Those
// two vectors are compared against each other by cosine distance, so they MUST come from
// the same model — routing both through one function is what guarantees that, rather than
// two call sites that happen to read the same setting today.
//
// The db workspace has its own embedder for seeding and bulk re-embedding, which reads the
// same OPENAI_MODEL_EMBEDDING for the same reason — see db/scripts/lib/embedding.ts.
//
// The client and the upstream error mapping are reused from openai.ts rather than rebuilt,
// so an embedding failure surfaces with the same status codes and the same "never leak the
// upstream body" discipline as a chat failure.

import { config } from "./config.js";
import { AppError } from "./errors.js";
import { getClient, toAppError } from "./openai.js";

/** Dimension of the `care_patterns.embedding` column. */
export const EMBEDDING_DIM = 1536;

export interface EmbeddingResult {
  /** Formatted as a pgvector literal, ready for a `$1::vector` parameter. */
  vector: string;
  model: string;
}

/** Format a number[] as a pgvector literal, e.g. "[0.1,0.2,...]". */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Embed one Care Pattern `situation` (Feature 17, on save).
 *
 * Throws an AppError on failure. Callers in the admin routes deliberately catch it and
 * save the text anyway — see the note on `needs_embedding` there.
 */
export async function embedSituation(situation: string): Promise<EmbeddingResult> {
  return embedText(situation);
}

/**
 * Embed an arbitrary text — in practice a Care Pattern `situation` or the English match
 * query built from a conversation (Feature 7).
 *
 * Throws an AppError on failure. The retrieval caller catches it and answers without
 * guidance rather than failing the turn: a reply with no Care Pattern is a worse reply,
 * but no reply at all is a broken product.
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const model = config.openai.embeddingModel;

  let response;
  try {
    response = await getClient().embeddings.create({ model, input: text });
  } catch (err) {
    throw toAppError(err);
  }

  const vector = response.data[0]?.embedding;
  if (!vector) {
    throw new AppError(502, "embedding_empty", "Could not index this text. Please try again.", {
      cause: new Error(`empty embedding response from ${model}`),
    });
  }

  if (vector.length !== EMBEDDING_DIM) {
    // Configuration error rather than a transient one, so it must not be retried or
    // silently swallowed: every pattern saved under it would be unsearchable.
    throw new AppError(
      500,
      "embedding_dimension_mismatch",
      "The assistant is misconfigured. Please contact an administrator.",
      {
        cause: new Error(
          `OPENAI_MODEL_EMBEDDING="${model}" returns ${vector.length} dimensions but ` +
            `care_patterns.embedding is vector(${EMBEDDING_DIM})`,
        ),
      },
    );
  }

  return { vector: toVectorLiteral(vector), model };
}
