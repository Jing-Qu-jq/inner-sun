// Care Pattern embeddings, server side (Feature 17).
//
// The db workspace has its own embedder for seeding and bulk re-embedding; this one runs
// when a researcher clicks Save. Both must produce comparable vectors, so both read the
// same OPENAI_MODEL_EMBEDDING and both embed only `situation` — see db/scripts/lib/embedding.ts.
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
 * Embed one Care Pattern `situation`.
 *
 * Throws an AppError on failure. Callers in the admin routes deliberately catch it and
 * save the text anyway — see the note on `needs_embedding` there.
 */
export async function embedSituation(situation: string): Promise<EmbeddingResult> {
  const model = config.openai.embeddingModel;

  let response;
  try {
    response = await getClient().embeddings.create({ model, input: situation });
  } catch (err) {
    throw toAppError(err);
  }

  const vector = response.data[0]?.embedding;
  if (!vector) {
    throw new AppError(502, "embedding_empty", "Could not index this pattern. Please try again.", {
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
