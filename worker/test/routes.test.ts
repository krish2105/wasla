import { env, exports } from 'cloudflare:workers';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env.js';

const base = env as unknown as Env;
const ISSUER = 'http://supabase.test/auth/v1';

// The pool wires our default export at runtime, but `Exports` is a generic
// type that cannot see it. Narrowed once here rather than cast at each call.
const worker = (
  exports as unknown as {
    default: { fetch(input: string, init?: RequestInit): Promise<Response> };
  }
).default;

let signingKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  // A real ES256 pair, matching how Supabase signs access tokens. Verifying
  // against a genuine signature is the only way to know auth.ts works rather
  // than only that it rejects nonsense.
  const pair = await generateKeyPair('ES256', { extractable: true });
  signingKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'test-key' };
});

async function token(claims: { sub?: string; expired?: boolean } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject(claims.sub ?? 'user-1')
    .setIssuer(ISSUER)
    .setIssuedAt(claims.expired ? now - 7200 : now)
    .setExpirationTime(claims.expired ? now - 3600 : now + 3600)
    .sign(signingKey);
}

/** Serves the JWKS; anything else is an unexpected call and fails loudly. */
function mockJwks() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.well-known/jwks.json')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

beforeEach(async () => {
  const { keys } = await base.CACHE.list();
  await Promise.all(keys.map((k) => base.CACHE.delete(k.name)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /ai/health', () => {
  it('answers without auth and never leaks a secret', async () => {
    const res = await worker.fetch('http://gw/ai/health');
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).not.toContain('test-gemini-key');
    expect(body).not.toContain('test-groq-key');
    expect(body).not.toContain(base.CACHE_KEY);

    const json = JSON.parse(body) as {
      providers: { id: string; canStream: boolean }[];
      tasks: string[];
    };
    expect(json.providers.map((p) => p.id)).toEqual(['gemini', 'groq']);
    expect(json.tasks).toContain('extract_resume');

    // Gemini has no verified streaming surface; health must say so honestly.
    expect(json.providers.find((p) => p.id === 'gemini')?.canStream).toBe(false);
    expect(json.providers.find((p) => p.id === 'groq')?.canStream).toBe(true);
  });
});

describe('auth', () => {
  it('rejects a request with no token', async () => {
    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect((await res.json() as { error: { code: string } }).error.code).toBe('unauthorized');
  });

  it('rejects a token signed by someone else', async () => {
    mockJwks();
    const other = await generateKeyPair('ES256', { extractable: true });
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject('attacker')
      .setIssuer(ISSUER)
      .setExpirationTime('1h')
      .sign(other.privateKey);

    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${forged}` },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    mockJwks();
    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token({ expired: true })}` },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a project that publishes no JWKS keys', async () => {
    // An empty key set means the project still signs with the legacy shared
    // secret. The gateway must say so rather than fall back to it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }))
    );

    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}` },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect((await res.json() as { error: { message: string } }).error.message).toContain(
      'legacy shared secret'
    );
  });
});

describe('task routes', () => {
  it('404s an unknown task and names the ones that exist', async () => {
    mockJwks();
    const res = await worker.fetch('http://gw/ai/task/not_a_task', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}` },
      body: '{}',
    });

    expect(res.status).toBe(404);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect(error.code).toBe('unknown_task');
    expect(error.message).toContain('extract_resume');
  });

  it('refuses to stream a structured task', async () => {
    // A JSON schema cannot be validated against a partial document, and Week 4
    // grounding needs the whole answer.
    mockJwks();
    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ stream: true }),
    });

    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect(error.code).toBe('invalid_request');
    expect(error.message).toContain('cannot stream');
  });

  it('requires a document for a document task', async () => {
    mockJwks();
    const res = await worker.fetch('http://gw/ai/task/extract_resume', {
      method: 'POST',
      headers: { authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ input: {} }),
    });

    expect(res.status).toBe(400);
    expect((await res.json() as { error: { message: string } }).error.message).toContain(
      'base64 PDF'
    );
  });
});
