/**
 * Every binding, secret and var the Worker uses. This is the only place they
 * are described; wrangler.jsonc declares them and `secrets.required` there
 * fails the deploy if a secret is missing.
 */
export interface Env {
  // Bindings
  AI: Ai;
  CACHE: KVNamespace;

  // Secrets
  GEMINI_API_KEY: string;
  GROQ_API_KEY: string;
  /** 32 bytes, base64. AES-256-GCM key for cache values. */
  CACHE_KEY: string;
  /** The Supabase project JWTs are issued by. */
  SUPABASE_URL: string;

  // Vars. Model ids are config, not constants: Groq deprecated both of this
  // project's original models with three days' notice.
  GEMINI_MODEL: string;
  GROQ_MODEL: string;
  /** Comma-separated provider ids, in failover order. */
  PROVIDER_ORDER: string;
  /** Requests per user per UTC day. Parsed with Number(). */
  DAILY_QUOTA: string;
}
