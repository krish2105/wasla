import type { Env } from '../env.js';
import {
  ProviderError,
  type CompletionRequest,
  type CompletionResult,
  type Provider,
} from './types.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Groq speaks the OpenAI dialect and is the only provider that reliably
 * returns `retry-after` and the full `x-ratelimit-*` set, so its errors carry
 * the most information.
 *
 * `strict: true` on json_schema is supported only by the gpt-oss models, which
 * are exactly the ones Groq's own deprecation notice points at.
 */
function body(req: CompletionRequest, model: string, stream: boolean): string {
  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  return JSON.stringify({
    model,
    messages,
    stream,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.schema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'result', strict: true, schema: req.schema },
          },
        }
      : {}),
  });
}

/**
 * Groq distinguishes per-minute from per-day only through which reset header
 * is large, so a long `x-ratelimit-reset-requests` is how we detect that the
 * daily allowance is gone rather than a momentary burst.
 */
function classify(res: Response, text: string): ProviderError {
  if (res.status === 401 || res.status === 403) {
    return new ProviderError('bad_key', 'groq', `Groq rejected the API key (${res.status}).`);
  }
  if (res.status === 400) {
    return new ProviderError('bad_request', 'groq', `Groq rejected the request: ${text}`);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || undefined;
    const daily = (retryAfter ?? 0) > 3600;
    return new ProviderError(
      daily ? 'daily_quota' : 'rate_limit',
      'groq',
      `Groq rate limit reached: ${text}`,
      retryAfter
    );
  }
  return new ProviderError('unavailable', 'groq', `Groq returned ${res.status}: ${text}`);
}

export const groq: Provider = {
  id: 'groq',
  acceptsDocuments: false,
  model: (env: Env) => env.GROQ_MODEL,
  apiKey: (env: Env) => env.GROQ_API_KEY ?? '',

  async complete(req, env, key, signal): Promise<CompletionResult> {
    const model = env.GROQ_MODEL;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: body(req, model, false),
    });

    if (!res.ok) throw classify(res, await res.text());

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new ProviderError('unavailable', 'groq', 'Groq returned no message content.');
    }
    return { text, model };
  },

  async *streamText(req, env, key, signal): AsyncIterable<string> {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: body(req, env.GROQ_MODEL, true),
    });

    if (!res.ok) throw classify(res, await res.text());
    if (!res.body) {
      throw new ProviderError('unavailable', 'groq', 'Groq returned no response body.');
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE frames are separated by a blank line; a chunk boundary can fall
      // anywhere, so only whole frames are consumed and the tail is kept.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // A malformed frame is not worth killing a live stream over.
        }
      }
    }
  },
};
