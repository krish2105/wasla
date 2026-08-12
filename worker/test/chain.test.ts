import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.js';
import { GatewayError } from '../src/errors.js';
import { runChain } from '../src/providers/chain.js';

const base = env as unknown as Env;

/** PROVIDER_ORDER is gemini,groq, so request 1 is Gemini and request 2 is Groq. */
function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...base, PROVIDER_ORDER: 'gemini,groq', ...overrides };
}

function geminiOk(text: string) {
  return new Response(JSON.stringify({ output_text: text }), { status: 200 });
}

function groqOk(text: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
  });
}

/** Queues responses in call order and records which URLs were hit. */
function mockFetch(responses: Response[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const next = responses.shift();
      if (!next) throw new Error('unexpected extra fetch');
      return next;
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Storage isolates per test file, not per test, so a breaker set by one case
// would leak into the next and silently change which provider is tried first.
beforeEach(async () => {
  const { keys } = await base.CACHE.list();
  await Promise.all(keys.map((k) => base.CACHE.delete(k.name)));
});

describe('failover policy', () => {
  it('uses the first provider when it succeeds', async () => {
    mockFetch([geminiOk('from gemini')]);
    const out = await runChain(testEnv(), { prompt: 'hi' });

    expect(out.provider).toBe('gemini');
    expect(out.attempts).toBe(1);
    expect(out.result.text).toBe('from gemini');
  });

  it('advances to the next provider on 429', async () => {
    const calls = mockFetch([
      new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429 }),
      groqOk('from groq'),
    ]);

    const out = await runChain(testEnv(), { prompt: 'hi' });

    expect(out.provider).toBe('groq');
    expect(out.attempts).toBe(2);
    expect(calls[1]).toContain('groq.com');
  });

  it('advances on 5xx', async () => {
    mockFetch([new Response('upstream boom', { status: 503 }), groqOk('ok')]);
    expect((await runChain(testEnv(), { prompt: 'hi' })).provider).toBe('groq');
  });

  it('advances past a bad key rather than failing the request', async () => {
    // A wrong key is a config fault, but it must not take the gateway down
    // while another provider is healthy.
    mockFetch([new Response('bad key', { status: 401 }), groqOk('ok')]);
    expect((await runChain(testEnv(), { prompt: 'hi' })).provider).toBe('groq');
  });

  it('treats Gemini 400 API_KEY_INVALID as a bad key, not a bad request', async () => {
    // Verified against the live API: Gemini answers an invalid key with 400
    // INVALID_ARGUMENT, not 401. Read literally that would stop the chain, so
    // one wrong secret would take the gateway down instead of failing over.
    // The body arrives wrapped in an array, which is why errorOf unwraps it.
    const calls = mockFetch([
      new Response(
        JSON.stringify([
          {
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'INVALID_ARGUMENT',
            },
          },
        ]),
        { status: 400 }
      ),
      groqOk('groq covered for it'),
    ]);

    const out = await runChain(testEnv(), { prompt: 'hi' });
    expect(out.provider).toBe('groq');
    expect(calls).toHaveLength(2);
  });

  it('STOPS on a genuinely malformed request', async () => {
    // The request is malformed. Trying it against every provider produces the
    // same error N times and hides the real cause.
    const calls = mockFetch([new Response('bad request', { status: 400 })]);

    await expect(runChain(testEnv(), { prompt: 'hi' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(calls).toHaveLength(1);
  });

  it('reports all_providers_failed when every provider errors', async () => {
    mockFetch([
      new Response('down', { status: 503 }),
      new Response('down', { status: 503 }),
    ]);

    await expect(runChain(testEnv(), { prompt: 'hi' })).rejects.toMatchObject({
      code: 'all_providers_failed',
    });
  });

  it('errors clearly when no provider is configured', async () => {
    const bare = testEnv({ GEMINI_API_KEY: '', GROQ_API_KEY: '' });
    await expect(runChain(bare, { prompt: 'hi' })).rejects.toBeInstanceOf(GatewayError);
  });

  it('skips providers that cannot take documents', async () => {
    // Groq accepts no PDFs, so a document request must never reach it.
    const calls = mockFetch([geminiOk('parsed')]);
    const out = await runChain(
      testEnv(),
      { prompt: 'hi', document: { data: new ArrayBuffer(4), mimeType: 'application/pdf' } },
      { needsDocuments: true }
    );

    expect(out.provider).toBe('gemini');
    expect(calls).toHaveLength(1);
  });
});

describe('daily quota breaker', () => {
  it('stops using a provider for the rest of the day after a daily quota error', async () => {
    mockFetch([
      new Response(JSON.stringify({ error: { code: 'quota_exceeded' } }), { status: 429 }),
      groqOk('ok'),
    ]);
    const e = testEnv();
    expect((await runChain(e, { prompt: 'one' })).provider).toBe('groq');

    // Second request must not pay Gemini's latency again: only Groq is called.
    const calls = mockFetch([groqOk('ok again')]);
    const out = await runChain(e, { prompt: 'two' });

    expect(out.provider).toBe('groq');
    expect(out.attempts).toBe(1);
    expect(calls[0]).toContain('groq.com');
  });

  it('does not break the provider for a per-minute limit', async () => {
    mockFetch([
      new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429 }),
      groqOk('ok'),
    ]);
    // Isolated key space so the breaker test above cannot leak into this one.
    const e = testEnv({ PROVIDER_ORDER: 'gemini,groq' });
    await runChain(e, { prompt: 'a' });

    const calls = mockFetch([geminiOk('recovered')]);
    expect((await runChain(e, { prompt: 'b' })).provider).toBe('gemini');
    expect(calls).toHaveLength(1);
  });
});

describe('BYOK', () => {
  it('uses only the named provider and never fails over', async () => {
    // Failing over would spend the user's credit at a provider they did not
    // choose, with a key that is not valid there anyway.
    const calls = mockFetch([new Response('rate limited', { status: 429 })]);

    await expect(
      runChain(testEnv(), { prompt: 'hi' }, { byok: { providerId: 'groq', key: 'user-key' } })
    ).rejects.toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('groq.com');
  });

  it('rejects an unknown provider name', async () => {
    await expect(
      runChain(testEnv(), { prompt: 'hi' }, { byok: { providerId: 'nope', key: 'k' } })
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
