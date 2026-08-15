// Real Care Pattern embeddings (Feature 6), replacing Feature 3's placeholder vectors.
//
// Only the `situation` field is ever embedded. That is the architectural decision behind
// the whole retrieval design: a student's message is matched against a description of a
// *situation*, not against the counselor guidance that situation calls for. Embedding the
// strategies too would pull the match toward advice language and quietly degrade it.

import OpenAI from "openai";
import { getEmbeddingModel, getOpenAiApiKey, getOpenAiBaseUrl } from "./env.js";
import { EMBEDDING_DIM } from "./vector.js";

/** Recorded as `embedding_model` for rows seeded via `db:seed --fake`. */
export const PLACEHOLDER_MODEL = "placeholder";

// The endpoint takes an array, so N patterns cost one round trip rather than N. Chunked
// well below OpenAI's input cap so a growing knowledge base does not one day exceed it.
const MAX_INPUTS_PER_REQUEST = 96;
const TIMEOUT_MS = 60_000;

let client: OpenAI | undefined;

function getClient(): OpenAI {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing (or still the .env.example placeholder), and real " +
        "embeddings need it.\n" +
        "  • Set a real key in the repo-root .env, or\n" +
        "  • stand up the database without one:  npm run db:seed -- --fake",
    );
  }
  client ??= new OpenAI({
    apiKey,
    baseURL: getOpenAiBaseUrl(),
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  });
  return client;
}

export interface EmbedTextsResult {
  vectors: number[][];
  /** The model that produced them — stored as `embedding_model` for provenance. */
  model: string;
}

/** Embed several texts in as few requests as possible. Order matches the input. */
export async function embedTexts(texts: string[]): Promise<EmbedTextsResult> {
  const model = getEmbeddingModel();
  if (texts.length === 0) {
    return { vectors: [], model };
  }

  const openai = getClient();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_INPUTS_PER_REQUEST) {
    const batch = texts.slice(start, start + MAX_INPUTS_PER_REQUEST);
    const response = await openai.embeddings.create({ model, input: batch });

    // The response carries an explicit `index` per item precisely so callers need not
    // assume array order. Pairing the wrong vector with the wrong pattern would not
    // throw — it would just make retrieval subtly, silently wrong — so sort on it.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new Error(`Asked ${model} for ${batch.length} embeddings but received ${ordered.length}.`);
    }

    for (const item of ordered) {
      assertDimension(item.embedding, model);
      vectors.push(item.embedding);
    }
  }

  return { vectors, model };
}

/** Embed a single text (a pattern's `situation`, or a query in verify.ts). */
export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const { vectors, model } = await embedTexts([text]);
  return { vector: vectors[0], model };
}

/**
 * A dimension mismatch is worth catching here rather than at the insert. Postgres would
 * reject it as "expected 1536 dimensions, not 3072", far from the setting that caused it.
 */
function assertDimension(vector: number[], model: string): void {
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `OPENAI_MODEL_EMBEDDING is "${model}", which returns ${vector.length}-dimensional ` +
        `vectors, but care_patterns.embedding is vector(${EMBEDDING_DIM}).\n` +
        `  • Use a ${EMBEDDING_DIM}-dimension model (text-embedding-3-small), or\n` +
        `  • migrate the column to ${vector.length} and re-embed every row —\n` +
        "    vectors from different models are not comparable, so a mixed table " +
        "produces meaningless similarity scores.",
    );
  }
}
