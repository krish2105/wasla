import type { Env } from './env.js';
import { GatewayError } from './errors.js';
import { utcMidnight } from './providers/chain.js';

/**
 * Per-user daily quota, counted in Postgres.
 *
 * Not in KV, and the reason matters: KV has no atomic operations, so a
 * read-modify-write counter loses increments under concurrency; it caps at one
 * write per second per key; and the free plan allows 1,000 writes per day in
 * total, which counting alone would consume. Cloudflare's own documentation
 * says KV is the wrong fit for this.
 *
 * The RPC is `security definer` and derives the user from `auth.uid()`, so the
 * caller's own JWT is enough and no service-role key ever lives in the Worker.
 */
export async function consumeQuota(
  env: Env,
  accessToken: string
): Promise<{ used: number; limit: number }> {
  const limit = Number(env.DAILY_QUOTA);

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: accessToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_limit: limit }),
  });

  if (!res.ok) {
    throw new GatewayError(
      'all_providers_failed',
      `Could not record usage against Supabase (${res.status}). The gateway refuses to ` +
        'serve requests it cannot meter.'
    );
  }

  // PostgREST returns a single-row table as a one-element array.
  const rows = (await res.json()) as { allowed: boolean; used: number }[];
  const row = rows[0];
  if (!row) {
    throw new GatewayError(
      'all_providers_failed',
      'consume_ai_quota returned no row. Check that migration 0003 has been applied.'
    );
  }

  if (!row.allowed) {
    throw new GatewayError(
      'quota_exceeded',
      `Daily limit of ${limit} AI requests reached. It resets at 00:00 UTC, or supply ` +
        'your own provider key with the X-User-Key header for unmetered access.',
      { retryAfter: Math.ceil((utcMidnight().getTime() - Date.now()) / 1000) }
    );
  }

  return { used: row.used, limit };
}
