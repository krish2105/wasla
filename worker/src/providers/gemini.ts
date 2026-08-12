import type { Env } from '../env.js';
import {
  ProviderError,
  type CompletionRequest,
  type CompletionResult,
  type Provider,
} from './types.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1/interactions';

/** Chunked because String.fromCharCode(...bytes) blows the stack on a large PDF. */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

type InputBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; data: string; mime_type: string };

function body(req: CompletionRequest, model: string): string {
  // A plain string is accepted for the common case; the block array is only
  // needed when a document rides along.
  const input: string | InputBlock[] = req.document
    ? [
        {
          type: 'document',
          data: toBase64(req.document.data),
          mime_type: req.document.mimeType,
        },
        { type: 'text', text: req.prompt },
      ]
    : req.prompt;

  return JSON.stringify({
    model,
    input,
    ...(req.system ? { instructions: req.system } : {}),
    // Gemini's structured-output shape is NOT OpenAI's json_schema wrapper.
    ...(req.schema
      ? {
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: req.schema,
          },
        }
      : {}),
  });
}

/**
 * Gemini returns 429 for both per-minute and per-day exhaustion. The only
 * discriminator is the error code string, and the difference matters: a spent
 * daily quota must circuit-break the provider, whereas a per-minute limit
 * recovers on its own.
 */
function classify(status: number, text: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError('bad_key', 'gemini', `Gemini rejected the API key (${status}).`);
  }
  if (status === 400) {
    return new ProviderError('bad_request', 'gemini', `Gemini rejected the request: ${text}`);
  }
  if (status === 429) {
    let code = '';
    try {
      code = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? '';
    } catch {
      // Fall through to the per-minute reading, which is the safer default:
      // it retries later rather than disabling the provider for a whole day.
    }
    return new ProviderError(
      code === 'quota_exceeded' ? 'daily_quota' : 'rate_limit',
      'gemini',
      `Gemini rate limit reached: ${text}`
    );
  }
  return new ProviderError('unavailable', 'gemini', `Gemini returned ${status}: ${text}`);
}

/**
 * The docs demonstrate `output_text` as an SDK convenience property while the
 * raw interaction resource exposes `steps[].content[].text`. A Worker calling
 * over plain fetch cannot rely on either alone, so both are read.
 */
function extractText(json: unknown): string | null {
  const doc = json as {
    output_text?: unknown;
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };

  if (typeof doc.output_text === 'string' && doc.output_text.length > 0) {
    return doc.output_text;
  }

  const parts: string[] = [];
  for (const step of doc.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}

/**
 * Gemini is primary only because it is the sole free provider that accepts a
 * PDF — not because it has the most headroom. Its free tier is roughly 10 RPM,
 * where Groq documents 30.
 *
 * No `streamText`: whether the Interactions API streams, and in what frame
 * format, could not be verified against the documentation. Streaming requests
 * therefore fail over to an OpenAI-dialect provider, which is correct
 * behaviour rather than a silent gap.
 */
export const gemini: Provider = {
  id: 'gemini',
  acceptsDocuments: true,
  model: (env: Env) => env.GEMINI_MODEL,
  apiKey: (env: Env) => env.GEMINI_API_KEY ?? '',

  async complete(req, env, key, signal): Promise<CompletionResult> {
    const model = env.GEMINI_MODEL;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'x-goog-api-key': key,
        'content-type': 'application/json',
      },
      body: body(req, model),
    });

    if (!res.ok) throw classify(res.status, await res.text());

    const text = extractText(await res.json());
    if (text === null) {
      throw new ProviderError(
        'unavailable',
        'gemini',
        'Gemini returned no text in output_text or steps[].content[].'
      );
    }
    return { text, model };
  },
};
