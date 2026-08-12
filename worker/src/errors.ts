/**
 * The single error contract. Every failure leaves the Worker through this
 * class, so the shape a caller sees never depends on which module failed.
 */

export type ErrorCode =
  | 'unauthorized'
  | 'quota_exceeded'
  | 'invalid_request'
  | 'unknown_task'
  | 'all_providers_failed'
  /** A provider answered, but its JSON did not match the task schema. */
  | 'schema_violation';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  quota_exceeded: 429,
  invalid_request: 400,
  unknown_task: 404,
  all_providers_failed: 503,
  schema_violation: 502,
};

export class GatewayError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly detail?: { provider?: string; retryAfter?: number }
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }

  toResponse(): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.detail?.retryAfter !== undefined) {
      headers['retry-after'] = String(this.detail.retryAfter);
    }
    return new Response(
      JSON.stringify({
        error: {
          code: this.code,
          message: this.message,
          ...(this.detail?.provider ? { provider: this.detail.provider } : {}),
          ...(this.detail?.retryAfter !== undefined
            ? { retryAfter: this.detail.retryAfter }
            : {}),
        },
      }),
      { status: this.status, headers }
    );
  }
}
