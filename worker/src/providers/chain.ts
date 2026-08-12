import type { Env } from '../env.js';
import { GatewayError } from '../errors.js';
import { gemini } from './gemini.js';
import { groq } from './groq.js';
import {
  ProviderError,
  type CompletionRequest,
  type CompletionResult,
  type Provider,
} from './types.js';

const REGISTRY: Record<string, Provider> = { gemini, groq };

/** How long a single provider gets before the chain moves on. */
const TIMEOUT_MS = 30_000;

export interface ChainOutcome {
  result: CompletionResult;
  provider: string;
  attempts: number;
  /** Set when a fallback path was taken, e.g. PDF text extraction. */
  degraded?: string;
}

/**
 * The configured chain, in order, skipping providers with no key. Unknown ids
 * in PROVIDER_ORDER are ignored rather than fatal, so a typo degrades to a
 * shorter chain instead of taking the Worker down.
 */
export function configuredProviders(env: Env): Provider[] {
  return env.PROVIDER_ORDER.split(',')
    .map((id) => id.trim())
    .flatMap((id) => {
      const provider = REGISTRY[id];
      if (!provider) return [];
      return provider.apiKey(env) ? [provider] : [];
    });
}

/** `breaker:{provider}:{day}` — at most one write per provider per day. */
function breakerKey(providerId: string): string {
  return `breaker:${providerId}:${new Date().toISOString().slice(0, 10)}`;
}

async function isBrokenToday(env: Env, providerId: string): Promise<boolean> {
  return (await env.CACHE.get(breakerKey(providerId))) !== null;
}

/**
 * A spent daily allowance is remembered so the rest of the day's requests skip
 * straight past this provider. Without it, every request pays the latency of a
 * call that cannot succeed until UTC midnight.
 */
async function breakForToday(env: Env, providerId: string): Promise<void> {
  const secondsLeft = Math.ceil((utcMidnight().getTime() - Date.now()) / 1000);
  await env.CACHE.put(breakerKey(providerId), '1', {
    // KV rejects a TTL under 60 seconds; near midnight, just use the floor.
    expirationTtl: Math.max(60, secondsLeft),
  });
}

export function utcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
}

/**
 * Try each configured provider in order.
 *
 * The policy, and why each branch is what it is:
 *   rate_limit    advance. This one recovers on its own.
 *   daily_quota   advance, and stop using this provider until UTC midnight.
 *   unavailable   advance. The provider is down, not us.
 *   bad_key       advance, but log — a missing key is a configuration fault
 *                 and must not hide behind silent failover.
 *   bad_request   STOP. Our request is malformed; trying three more providers
 *                 just produces the same error three more times.
 */
export async function runChain(
  env: Env,
  req: CompletionRequest,
  opts: {
    needsDocuments?: boolean;
    /**
     * BYOK. The user's own key is used against one named provider and nothing
     * else: failing over would silently spend their credit somewhere they did
     * not choose, and their key is not valid at another provider anyway.
     */
    byok?: { providerId: string; key: string };
  } = {}
): Promise<ChainOutcome> {
  if (opts.byok) {
    const provider = REGISTRY[opts.byok.providerId];
    if (!provider) {
      throw new GatewayError(
        'invalid_request',
        `X-User-Provider must name a known provider. Known: ${Object.keys(REGISTRY).join(', ')}.`
      );
    }
    if (opts.needsDocuments && !provider.acceptsDocuments) {
      throw new GatewayError(
        'invalid_request',
        `${provider.id} does not accept documents. Send X-User-Provider: gemini for PDF tasks.`
      );
    }
    const result = await provider.complete(
      req,
      env,
      opts.byok.key,
      AbortSignal.timeout(TIMEOUT_MS)
    );
    return { result, provider: provider.id, attempts: 1 };
  }

  const providers = configuredProviders(env);
  if (providers.length === 0) {
    throw new GatewayError(
      'all_providers_failed',
      'No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY and check PROVIDER_ORDER.'
    );
  }

  let attempts = 0;
  let last: ProviderError | null = null;

  for (const provider of providers) {
    if (opts.needsDocuments && !provider.acceptsDocuments) continue;
    if (await isBrokenToday(env, provider.id)) continue;

    attempts++;
    const timeout = AbortSignal.timeout(TIMEOUT_MS);

    try {
      const result = await provider.complete(req, env, provider.apiKey(env), timeout);
      return { result, provider: provider.id, attempts };
    } catch (err) {
      const error =
        err instanceof ProviderError
          ? err
          : new ProviderError(
              'unavailable',
              provider.id,
              err instanceof Error ? err.message : String(err)
            );

      if (error.kind === 'bad_request') {
        throw new GatewayError('invalid_request', error.message, { provider: provider.id });
      }
      if (error.kind === 'bad_key') {
        console.error(`[gateway] ${provider.id} rejected its API key — check the secret.`);
      }
      if (error.kind === 'daily_quota') {
        await breakForToday(env, provider.id);
      }
      last = error;
    }
  }

  throw new GatewayError(
    'all_providers_failed',
    last
      ? `Every configured provider failed. Last: ${last.message}`
      : 'No provider could serve this request. Providers that accept documents may all be exhausted for today.',
    { provider: last?.provider, retryAfter: last?.retryAfter }
  );
}

/**
 * Streaming needs a provider that implements streamText. Gemini does not, so a
 * streaming request skips it rather than silently returning a buffered answer.
 */
export async function pickStreamingProvider(env: Env): Promise<Provider | null> {
  for (const provider of configuredProviders(env)) {
    if (!provider.streamText) continue;
    if (await isBrokenToday(env, provider.id)) continue;
    return provider;
  }
  return null;
}
