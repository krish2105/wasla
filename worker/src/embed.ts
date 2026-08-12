import type { Env } from './env.js';
import { GatewayError } from './errors.js';

/**
 * Embeddings from Workers AI.
 *
 * The model is fixed, not configurable: `profiles.embedding` is `vector(768)`
 * and an HNSW index is built over it, so a model of any other width does not
 * fail loudly -- it fails at insert time, or worse, silently corrupts
 * retrieval. bge-m3 (1024) is the specific wrong answer this guards against.
 */
const MODEL = '@cf/baai/bge-base-en-v1.5';
export const DIMENSIONS = 768;

/**
 * Pinned explicitly rather than left to the default. Cloudflare's docs warn
 * that cls-pooled and mean-pooled embeddings are mutually incompatible, and
 * mixing them would quietly poison the pgvector index -- a bug that would look
 * like "search got worse" months later.
 */
const POOLING = 'mean';

/** bge-base-en-v1.5 truncates at 512 tokens; chunking is the caller's job. */
export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    throw new GatewayError('invalid_request', 'Provide at least one text to embed.');
  }

  const res = (await env.AI.run(MODEL, { text: texts, pooling: POOLING })) as {
    data?: number[][];
  };

  const vectors = res.data;
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new GatewayError(
      'all_providers_failed',
      `Workers AI returned ${vectors?.length ?? 0} embeddings for ${texts.length} inputs.`
    );
  }

  const width = vectors[0]?.length;
  if (width !== DIMENSIONS) {
    throw new GatewayError(
      'all_providers_failed',
      `Expected ${DIMENSIONS}-dimension embeddings from ${MODEL} but got ${width}. ` +
        'profiles.embedding is vector(768); do not change the model without a migration.'
    );
  }

  return vectors;
}
