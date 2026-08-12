import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { cacheKey, read, write } from '../src/cache.js';
import type { Env } from '../src/env.js';

const testEnv = env as unknown as Env;

describe('cache', () => {
  it('round-trips a value through encryption', async () => {
    await write(testEnv, 'k1', '{"hello":"world"}', 60);
    expect(await read(testEnv, 'k1')).toBe('{"hello":"world"}');
  });

  it('stores ciphertext, not the plaintext', async () => {
    const secret = 'salary is 45000 AED';
    await write(testEnv, 'k2', secret, 60);

    // The whole point of encrypting at rest: a KV dump must not reveal the CV.
    const raw = await testEnv.CACHE.get('k2', 'arrayBuffer');
    const asText = new TextDecoder().decode(raw!);
    expect(asText).not.toContain(secret);
  });

  it('treats an unknown envelope version as a miss, not an error', async () => {
    // Version byte 99 is what a future layout would look like to today's code.
    const bogus = new Uint8Array(1 + 12 + 16);
    bogus[0] = 99;
    await testEnv.CACHE.put('k3', bogus);
    expect(await read(testEnv, 'k3')).toBeNull();
  });

  it('treats an undecryptable entry as a miss', async () => {
    // Right version byte, garbage payload: what a rotated CACHE_KEY looks like.
    const corrupt = new Uint8Array(1 + 12 + 16);
    corrupt[0] = 1;
    await testEnv.CACHE.put('k4', corrupt);
    expect(await read(testEnv, 'k4')).toBeNull();
  });

  it('returns null for a key that was never written', async () => {
    expect(await read(testEnv, 'absent')).toBeNull();
  });

  it('changes the key when the schema version changes', async () => {
    const base = { task: 't', model: 'm', input: 'i' };
    const v1 = await cacheKey({ ...base, schemaVersion: 1 });
    const v2 = await cacheKey({ ...base, schemaVersion: 2 });

    // Otherwise new code would be served entries shaped for the old schema.
    expect(v1).not.toBe(v2);
  });

  it('gives the same key for the same inputs', async () => {
    const parts = { task: 't', model: 'm', input: 'i', schemaVersion: 1 };
    expect(await cacheKey(parts)).toBe(await cacheKey(parts));
  });
});
