import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// vitest-pool-workers rewrote its API in v0.13: the plugin form replaces
// defineWorkersConfig, `env` moved to cloudflare:workers, SELF became
// exports.default, and fetchMock was removed in favour of replacing
// globalThis.fetch.
//
// Bindings are declared here rather than read from wrangler.jsonc on purpose.
// Workers AI has no local emulation, so inheriting the `ai` binding makes the
// pool open a remote proxy session and demand a CLOUDFLARE_API_TOKEN. Unit
// tests cover the logic that can run locally; /ai/embed is exercised by
// scripts/gateway-proof.mjs against a real binding.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      miniflare: {
        compatibilityDate: '2026-08-12',
        kvNamespaces: ['CACHE'],
        bindings: {
          // Test values, deliberately not shaped like real credentials.
          GEMINI_API_KEY: 'test-gemini-key',
          GROQ_API_KEY: 'test-groq-key',
          // 32 zero bytes, base64: valid AES-256 length, obviously not a secret.
          CACHE_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          SUPABASE_URL: 'http://supabase.test',
          GEMINI_MODEL: 'gemini-3.6-flash',
          GROQ_MODEL: 'openai/gpt-oss-20b',
          PROVIDER_ORDER: 'gemini,groq',
          DAILY_QUOTA: '100',
        },
      },
    }),
  ],
});
