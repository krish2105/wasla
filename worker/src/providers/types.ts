/**
 * The contract every provider adapter implements.
 *
 * Adapters normalise two genuinely different protocols. Gemini uses the
 * Interactions API with an `x-goog-api-key` header and its own
 * `response_format` shape; Groq, Cerebras and OpenRouter use the OpenAI
 * dialect with `Authorization: Bearer`. The chain above them never sees the
 * difference.
 */

export interface CompletionRequest {
  system?: string;
  prompt: string;
  /** JSON Schema. Present means the provider must return matching JSON. */
  schema?: Record<string, unknown>;
  /** Only Gemini accepts documents. `chain` checks `acceptsDocuments` first. */
  document?: { data: ArrayBuffer; mimeType: string };
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  /** The model that actually answered, which may differ from the request. */
  model: string;
}

/**
 * Why a provider call failed, in the terms the failover policy cares about.
 * The adapter maps each provider's own error vocabulary onto this.
 */
export type FailureKind =
  /** Per-minute or per-second limit. Try the next provider; this one recovers. */
  | 'rate_limit'
  /** Daily allowance spent. Try the next provider AND stop using this one today. */
  | 'daily_quota'
  /** 5xx, timeout, network error. Try the next provider. */
  | 'unavailable'
  /** 401/403. A configuration fault: skip this provider and log loudly. */
  | 'bad_key'
  /** 400. Our request is malformed; failing over would just break four times. */
  | 'bad_request';

export class ProviderError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly provider: string,
    message: string,
    /** Seconds, when the provider tells us. Only Groq reliably does. */
    readonly retryAfter?: number
  ) {
    super(message);
  }
}

export interface Provider {
  readonly id: string;
  /** Only Gemini accepts application/pdf among the free tiers. */
  readonly acceptsDocuments: boolean;
  /** The configured model id, for cache keys and response headers. */
  model(env: import('../env.js').Env): string;
  /** Reads its own key from env. Returns '' when unconfigured. */
  apiKey(env: import('../env.js').Env): string;

  complete(
    req: CompletionRequest,
    env: import('../env.js').Env,
    key: string,
    signal: AbortSignal
  ): Promise<CompletionResult>;

  /**
   * Optional. Yields text deltas; the route encodes them as SSE, so the wire
   * format is identical no matter which provider served the request.
   * A provider without this is skipped for streaming requests.
   */
  streamText?(
    req: CompletionRequest,
    env: import('../env.js').Env,
    key: string,
    signal: AbortSignal
  ): AsyncIterable<string>;
}
