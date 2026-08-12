import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose';
import type { Env } from './env.js';
import { GatewayError } from './errors.js';

/**
 * Verifies the caller's Supabase access token.
 *
 * Asymmetric only, deliberately. Supabase's legacy mode signs with a shared
 * HS256 secret, and verifying that would require giving the Worker a secret
 * that can *mint* tokens as well as check them. A public key can only ever
 * verify. A project still on legacy keys gets a named error and a fix rather
 * than a silent downgrade.
 */

const JWKS_KV_KEY = 'jwks';
const JWKS_TTL_SECONDS = 86_400;

export interface Caller {
  /** The `sub` claim: the Supabase user id. */
  userId: string;
  /** Present when the caller supplied their own provider key. */
  byokKey: string | null;
}

async function loadJwks(env: Env): Promise<JSONWebKeySet> {
  const cached = await env.CACHE.get(JWKS_KV_KEY, 'json');
  if (cached) return cached as JSONWebKeySet;

  const url = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new GatewayError(
      'unauthorized',
      `Could not read the Supabase JWKS at ${url} (${res.status}). Check SUPABASE_URL.`
    );
  }

  const jwks = (await res.json()) as JSONWebKeySet;
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    throw new GatewayError(
      'unauthorized',
      'The Supabase project publishes no JWKS keys, which means it still signs tokens ' +
        'with the legacy shared secret. Enable asymmetric JWT signing keys in ' +
        'Authentication -> JWT Keys before using the gateway.'
    );
  }

  // One write per day. Well inside the KV free-plan write budget.
  await env.CACHE.put(JWKS_KV_KEY, JSON.stringify(jwks), {
    expirationTtl: JWKS_TTL_SECONDS,
  });
  return jwks;
}

export async function authenticate(request: Request, env: Env): Promise<Caller> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new GatewayError(
      'unauthorized',
      'Missing bearer token. Send the Supabase access token as Authorization: Bearer <token>.'
    );
  }

  try {
    const { payload } = await jwtVerify(token, createLocalJWKSet(await loadJwks(env)), {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new GatewayError('unauthorized', 'Token carries no sub claim.');
    }
    return {
      userId: payload.sub,
      byokKey: request.headers.get('x-user-key'),
    };
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    throw new GatewayError(
      'unauthorized',
      `Token rejected: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
