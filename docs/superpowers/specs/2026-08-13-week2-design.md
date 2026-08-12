# Week 2 — AI gateway, resume ingestion, profile extraction

Design agreed 2026-08-13. Supersedes the Week 2 bullets in
`docs/WASLA_Master_Build_Plan.md` Part 8 wherever the two disagree.

Week 2 is four subsystems, not one. They are specified together because they
ship together, but each has its own verify gate and none may start before the
one it depends on is green.

| Phase | Ships | Depends on |
|---|---|---|
| 2A | Cloudflare Worker `ai-gateway` | nothing |
| 2B | Resume upload to R2 + `resume_files` table | nothing |
| 2C | Edge Function: PDF -> gateway -> `profiles` | 2A, 2B |
| 2D | Profile edit UI + embedding on save | 2A, 2C |

---

## Facts verified live on 2026-08-13

Session 1 established that the docs in this repo name stale versions. The same
check was run before writing any code this session. Everything below was read
from the vendor's own documentation or the npm registry today.

### Toolchain

| Package | Version | Note |
|---|---|---|
| `wrangler` | 4.122.0 | config is `wrangler.jsonc`; some features are JSON-only |
| `@cloudflare/vitest-pool-workers` | 0.21.2 | requires `vitest ^4.1.0` |
| `vitest` | 4.1.10 | satisfies the peer range |
| `hono` | 4.13.1 | routing |
| `jose` | 6.2.8 | JWKS verification |
| `unpdf` | 1.8.0 | PDF text extraction, runs in the Workers runtime |
| `@cloudflare/workers-types` | 5.20260812.1 | |
| `cloudflare/wrangler-action` | v4 | Cloudflare's own docs still say v3; v4 is current |

### Corrections to this repo's assumptions

| The repo said | Actually |
|---|---|
| Groq `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` | **Both shut down 2026-08-16.** Replacements: `openai/gpt-oss-20b`, `openai/gpt-oss-120b` |
| "Gemini Flash" | Not a model ID. Current free Flash is `gemini-3.6-flash` |
| Embeddings via `bge-m3` (build plan Parts 4, 6.1) | `@cf/baai/bge-base-en-v1.5`, 768-dim, per `CLAUDE.md` invariant 5 |
| Fail over on 429 | Insufficient. OpenRouter returns **402** on negative balance even for free models; Gemini returns 429 for both per-minute and per-day, distinguished only by an error-code string |
| One request body works for every provider | **Two dialects.** Gemini uses `response_format:{type,mime_type,schema}` and `x-goog-api-key`; the rest use OpenAI-shaped `response_format:{type:"json_schema",json_schema:{...}}` and `Authorization: Bearer` |
| Quota counters in KV | KV has no atomic operations, caps at 1 write/s/key, and the **free plan allows 1,000 writes/day total** |

### Free-tier ceilings that shaped these decisions

- **Cloudflare KV free: 1,000 writes/day**, 100,000 reads/day. Each cache miss
  costs one write. This is the sharpest constraint in the subsystem.
- **Workers AI free: 10,000 neurons/day**, resetting 00:00 UTC.
  `bge-base-en-v1.5` costs 6,058 neurons per million input tokens, so the daily
  budget is roughly 1.65M tokens of embedding. Embedding is not a binding
  constraint.
- **Gemini free**: roughly 10 RPM. Unofficial — Google no longer publishes
  free-tier numbers and points to the AI Studio dashboard. RPM, not RPD, is the
  binding limit.
- **Groq free**: 30 RPM, 14.4K RPD, but **TPD 100K–500K** is the real ceiling
  for resume-sized payloads.

---

## Decisions taken, with the reasoning

Recorded so a later session does not relitigate them.

**The gateway exposes both a task API and an OpenAI-compatible passthrough.**
Task routes keep prompts and JSON schemas server-side, which makes cache keys
stable and stops a client rewriting a prompt. The passthrough exists for
experimentation and any future free-form feature. Both are real routes with real
tests; the passthrough is not a debug backdoor.

**Callers authenticate with their existing Supabase JWT.** The Worker verifies
the signature against the project JWKS and reads `sub`. No second auth system,
and usage is attributable whether the caller is the app or an Edge Function
acting for a user.

**Quota counters live in Supabase Postgres, not KV.** Cloudflare's documentation
disqualifies KV for counters: no atomic operations, a hard 1 write/second/key
limit, and a 1,000-writes/day free ceiling that quota counting alone would
consume. The native Rate Limiting binding cannot substitute — its `period`
accepts only 10 or 60 seconds, so there is no daily window, and it is documented
as "intentionally designed to not be used as an accurate accounting system."
Durable Objects is Cloudflare's own recommendation for counters, but its
availability on the Workers Free plan could not be verified, and the $0
constraint makes an unverified paid dependency unacceptable.

Postgres gives an exact, atomic counter for free, in a database already in the
stack, and makes a usage dashboard possible later without new infrastructure.

**Caching is per-task, not global.** Given 1,000 KV writes/day, only tasks whose
recomputation is expensive earn a cache entry. Each task in the registry
declares its own policy. `/ai/health` reports the day's cache-write count so the
ceiling is visible before it is hit.

**Cache values are encrypted at rest.** Keys are content hashes, so
resume-derived output would otherwise sit in KV as readable PII. AES-256-GCM via
WebCrypto, which is in the Workers runtime and needs no dependency.

**BYOK requests bypass both cache and quota.** A user supplying their own key
gets a fresh call every time; nothing they generate is stored, and nothing
stored is served to them.

**Two provider adapters ship, not four.** Gemini and Groq are the two keys that
exist. The chain is an ordered array built from config, so Cerebras and
OpenRouter are one file plus one config entry each with no change to chain
logic. `CLAUDE.md` invariant 1 is amended to describe this accurately rather
than describing four adapters that do not exist.

Research also showed the missing two would add little: Cerebras free is 5 RPM on
a $5 trial credit, and OpenRouter free is 50 requests/day unless $10 has been
spent, which the budget forbids. They are a dribble, not capacity.

**Streaming is a per-route capability, not a global one.** You cannot fail over
after the first byte is sent, cannot validate a JSON schema against a partial
document, and cannot cache a response you have not finished reading.

| Route | Streams | Why |
|---|---|---|
| `POST /ai/v1/chat/completions` | opt-in via `stream: true` | free-form text, nothing to validate |
| `POST /ai/task/:name` | never; returns 400 if asked | schema validation needs the whole document |
| `POST /ai/embed` | n/a | not a text response |

Failover therefore happens before first byte only. After that an upstream
failure surfaces as a stream error the client must handle. This is inherent to
streaming, not a shortcut taken here.

**Resume extraction degrades rather than dies.** PDF input is Gemini-only among
free providers. Rather than accept a single point of failure, the Worker
extracts plain text from the PDF with `unpdf` when Gemini is unavailable and
sends text to the next provider. Extraction quality drops without layout, and
the response records which path was taken so the caller can say so.

---

## 2A — the Worker

### Placement

`worker/` at the repository root with its **own** `package.json`. Worker
dependencies must never enter the Expo dependency graph: `npm run build:web`
runs `expo export`, which prerenders in Node, and Week 1 already proved that a
package assuming a non-Node runtime breaks that build. The root `package.json`
delegates via `--prefix worker`.

### Modules

Each file has one job and is testable alone.

```
worker/
  package.json          own dependency graph
  wrangler.jsonc        bindings, vars, secrets.required
  tsconfig.json
  vitest.config.ts
  .dev.vars.example     committed; .dev.vars is gitignored
  src/
    index.ts            router and CORS only, no business logic
    env.ts              the Env type; the single description of every binding
    errors.ts           error codes and the JSON error contract
    auth.ts             Supabase JWT verification
    quota.ts            calls the Postgres RPC
    cache.ts            encrypted read-through cache
    embed.ts            Workers AI embeddings
    pdf.ts              unpdf text extraction, the Gemini fallback path
    providers/
      types.ts          the Provider interface
      gemini.ts         Interactions API dialect
      groq.ts           OpenAI dialect
      chain.ts          ordering and the retry policy
    tasks/
      registry.ts       name -> prompt, schema, provider preference, cache policy
      extract-resume.ts the Week 2C task
  test/
    *.test.ts
```

### Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/ai/task/:name` | structured task from the registry; never streams |
| POST | `/ai/v1/chat/completions` | OpenAI-shaped passthrough; `stream: true` allowed |
| POST | `/ai/embed` | `bge-base-en-v1.5`, returns 768-length arrays |
| GET | `/ai/health` | configured providers, resolved bindings, today's cache-write count; no secrets |

### The failover policy

The core of the subsystem, applied identically by every route.

| Upstream result | Action | Reasoning |
|---|---|---|
| 429, error code indicates per-minute | advance to next provider | transient |
| 429, error code indicates daily quota | advance, and **circuit-break that provider for the rest of the UTC day** | retrying a spent daily quota wastes every subsequent request |
| 402 | advance, circuit-break for the day | OpenRouter returns this on a negative balance even for free models |
| 5xx, timeout, network error | advance to next provider | provider is down |
| 401, 403 | skip provider, log at error level | a bad or missing key is a configuration fault and must not hide behind silent failover |
| 400 | stop and surface it | the request is malformed; failing over breaks four times instead of once |

Attempts are capped at the number of configured providers. Circuit-break state
is a KV key `breaker:{provider}:{YYYY-MM-DD}` — one write per provider per day
at most, which fits the write budget.

Every response carries:

- `X-Wasla-Provider` — which provider served it, or `cache`
- `X-Wasla-Cache` — `hit` or `miss`
- `X-Wasla-Attempts` — how many providers were tried
- `X-Wasla-Degraded` — present only when a fallback path was used, e.g.
  `pdf-text-extraction`

These headers are what make failover demonstrable rather than asserted.

### Request lifecycle

```
caller
  | Authorization: Bearer <supabase jwt>     X-User-Key optional
  v
auth.ts     verify against JWKS (cached in KV)   -> 401 unauthorized
  v
cache.ts    BYOK ? skip : decrypt and return     -> 200 X-Wasla-Cache: hit
  v
quota.ts    BYOK ? skip : consume_ai_quota()     -> 429 quota_exceeded
  v
chain.ts    provider[0] -> 429/402/5xx -> provider[1] -> 503 all_providers_failed
  |                        400 -> stop, surface
  v
validate    structured task ? parse and check    -> 502 schema_violation
  v
cache.ts    task opts in and not BYOK ? encrypt and write
  v
200 + X-Wasla-* headers
```

Cache is checked **before** quota deliberately: a cache hit costs no provider
call, so it must not consume the user's daily budget.

### Quota design

Migration `0003_ai_usage.sql` adds:

```sql
create table ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);
```

with own-row-only RLS and explicit per-role grants. Week 1 established that a
correct policy without a `GRANT` still returns `42501`; every migration after
`0002` carries its own grants.

The counter is consumed through a `security definer` function with
`search_path = ''`, deriving the user from `auth.uid()` so a caller cannot
increment someone else's row:

```sql
create function consume_ai_quota(p_limit integer)
returns table (allowed boolean, used integer, resets_at timestamptz)
```

The increment is a single atomic statement that only fires while under the
limit, so a denied request does not inflate the count:

```sql
insert into ai_usage (user_id, day, count) values (auth.uid(), today, 1)
on conflict (user_id, day)
  do update set count = ai_usage.count + 1 where ai_usage.count < p_limit
returning count
```

No rows returned means denied. `resets_at` is the next UTC midnight and becomes
the `retryAfter` in the error body. The Worker calls this RPC with the caller's
own JWT, so no service-role key ever lives in the Worker.

### Cache design

Key: `sha256(taskName + modelId + normalizedInput + schemaVersion)`, hex.
Including `schemaVersion` means changing a task's output shape invalidates its
entries automatically instead of serving a stale shape to new code.

Value: `[1-byte version][12-byte IV][ciphertext]` as an `ArrayBuffer`,
AES-256-GCM, key from the 32-byte base64 `CACHE_KEY` secret. The leading version
byte allows key rotation without wiping the namespace: a reader seeing an
unknown version treats the entry as a miss.

Only tasks whose registry entry sets a TTL are cached. Cache writes are counted
via a lightweight RPC fired with `ctx.waitUntil` so counting never adds latency
to the response.

### Auth design

`auth.ts` fetches the Supabase JWKS once and caches it in KV under
`jwks:{projectRef}` with a 24-hour TTL. Verification uses `jose`. A token
failing signature, expiry, or issuer checks yields `401 unauthorized`. The
verified `sub` is the quota subject.

### Provider dialects

The two adapters are genuinely different protocols, not parameterisations.

**Gemini** — `POST https://generativelanguage.googleapis.com/v1/interactions`,
header `x-goog-api-key`, body `{model, input, response_format:{type,mime_type,schema}}`.
The documentation is inconsistent about the response envelope: it demonstrates
`output_text` as an SDK convenience property, while the raw resource exposes
`steps[].content[].text`. The adapter reads `output_text` when present and walks
`steps` otherwise, because a no-SDK Worker cannot rely on either alone. PDF is
sent as a flat `{type:"document", data, mime_type}` block, up to 50 MB or 1000
pages.

**Groq** — `POST https://api.groq.com/openai/v1/chat/completions`, header
`Authorization: Bearer`, OpenAI-shaped body and
`response_format:{type:"json_schema",json_schema:{name,strict,schema}}`.
`strict: true` is supported only on `openai/gpt-oss-20b` and
`openai/gpt-oss-120b`, which are exactly the migration targets. Groq is the only
provider returning reliable `retry-after` and `x-ratelimit-*` headers.

### Error contract

```json
{ "error": { "code": "...", "message": "...", "provider": "...", "retryAfter": 0 } }
```

`provider` and `retryAfter` appear only when meaningful.

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | missing, malformed, or invalid JWT |
| `quota_exceeded` | 429 | daily budget spent; `retryAfter` is set |
| `invalid_request` | 400 | body failed validation, or `stream` on a structured task |
| `unknown_task` | 404 | `:name` is not in the registry |
| `all_providers_failed` | 503 | every configured provider errored |
| `schema_violation` | 502 | a provider answered but the JSON did not match the schema |

`schema_violation` is deliberately distinct from `all_providers_failed`. One
means the model lied about the shape; the other means nobody answered. Week 4's
grounding metric depends on counting the first without the second.

Messages name the cause and the fix, per the copy rules in `CLAUDE.md`.

### Configuration

Model IDs are configuration, not constants, so a provider deprecating a model is
a secret change rather than a deploy — a lesson from Groq deprecating both
previously-named models three days after this spec was written.

| Name | Kind | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | secret | primary provider |
| `GROQ_API_KEY` | secret | first failover |
| `CACHE_KEY` | secret | 32 bytes base64, AES-256-GCM |
| `SUPABASE_URL` | var | derives JWKS URL, issuer, and the RPC endpoint |
| `GEMINI_MODEL` | var | default `gemini-3.6-flash` |
| `GROQ_MODEL` | var | default `openai/gpt-oss-20b` |
| `PROVIDER_ORDER` | var | comma-separated; the chain order |
| `DAILY_QUOTA` | var | requests per user per UTC day |
| `AI` | binding | Workers AI |
| `CACHE` | binding | KV namespace |

`wrangler.jsonc` declares `secrets.required` so a missing secret fails at deploy
rather than at runtime. Local development uses `.dev.vars`; `.dev.vars.example`
is committed. `.gitignore` gains `.dev.vars*` and `.env*` — the trailing glob
matters, because per-environment variants exist.

Compatibility date is `2026-08-12`, which is at or after 2026-08-04 and
therefore has `nodejs_compat` enabled by default. The flag must not also be set
manually.

### Testing

`@cloudflare/vitest-pool-workers` rewrote its public API in v0.13. The current
form is the `cloudflareTest()` plugin inside `defineConfig({plugins:[...]})`;
`env` comes from `cloudflare:workers`, `SELF` is replaced by `exports.default`,
and `fetchMock` was deleted — outbound fetch is mocked by replacing
`globalThis.fetch`. KV and R2 are not mocked but backed by real local storage,
isolated per test file.

Tests must cover: each failover transition; 400 stopping the chain; 401 skipping
a provider without stopping it; the daily-quota circuit breaker; cache
encrypt/decrypt round trip; an unknown cache version byte treated as a miss; JWT
rejection on bad signature and on expiry; `stream: true` rejected on a
structured task; the PDF text-extraction fallback setting `X-Wasla-Degraded`;
and `/ai/health` never emitting a secret.

`scripts/gateway-proof.mjs` follows the existing `scripts/rls-proof.mjs`
pattern: prints a table, exits non-zero on failure. `npm run verify` gains
`worker:typecheck` and `worker:test`.

### Verify gate for 2A

1. `npm run worker:test` — every branch above passes.
2. `npm run ai:proof` against a running Worker with real keys.
3. Forcing Gemini to 429 produces a successful response carrying
   `X-Wasla-Provider: groq`.

---

## 2B — resume upload to R2

R2 bucket `wasla-resumes`, private. The app never holds an R2 credential: it
asks the Worker for a presigned PUT URL scoped to one object key, then uploads
directly. Object key is `resumes/{userId}/{uuid}.pdf`, so the key carries the
ownership claim the Worker checks against the JWT `sub`.

Migration `0004_resume_files.sql` records `user_id`, `object_key`, `bytes`,
`content_type`, `uploaded_at`, with own-row-only RLS and explicit grants.

Accepted type is `application/pdf` only, 10 MB ceiling, both enforced in the
Worker before a URL is issued.

**Verify:** upload a PDF from the app, fetch it back, confirm a second account
is denied both the row and the object.

## 2C — extraction

A Supabase Edge Function `parse_resume` (Deno) reads the R2 object, calls
`POST /ai/task/extract_resume`, validates the returned JSON against the task
schema, and proposes a profile. It forwards the caller's own JWT so quota
attributes to the real user.

Gemini is the preferred provider because of native PDF input. On Gemini failure
the Worker extracts text with `unpdf` and continues down the chain, setting
`X-Wasla-Degraded: pdf-text-extraction`. The Edge Function surfaces that flag so
the UI can tell the user extraction ran without layout.

Extraction writes nothing the user has not seen: the function returns the
proposed profile and 2D commits it.

**Verify:** a real CV populates a profile in under 30 seconds.

## 2D — profile UI and embeddings

An edit screen where every extracted field is editable before commit, per the
build plan's rule never to trust extraction blindly. Fields the model could not
find are empty and labelled, not invented.

On save the app calls `POST /ai/embed` and writes the 768-dimension result to
`profiles.embedding`. Pooling is pinned to `mean` explicitly: Cloudflare's docs
warn that `cls`-pooled embeddings are incompatible with `mean`-pooled ones, and
mixing them would silently corrupt the pgvector index.

**Verify:** every field editable; `profiles.embedding` is non-null and of
length 768.

---

## Out of scope

Named so they are not smuggled in:

- Cerebras and OpenRouter adapters
- Streaming on task routes
- A usage dashboard, though the Postgres counter makes one possible
- Cache warming or precomputation
- Retry with backoff inside a single provider; the chain moves on instead
- Token-level accounting; the quota counts requests, not tokens

## Known limits

- The quota counts requests, not tokens, so Groq's TPD ceiling can be reached
  while the request count still looks healthy.
- Failover cannot occur after the first streamed byte.
- PDF text extraction without layout produces worse structure than Gemini's
  native document input; the degraded path is a fallback, not an equivalent.
- Gemini's free-tier limits are not published; the ~10 RPM figure is unofficial.
- The Gemini Interactions API response envelope is documented ambiguously; the
  adapter handles both observed shapes and the live proof settles which occurs.
- Deploying 2A, and all of 2B, requires a Cloudflare account that does not yet
  exist. Every phase is developed and tested locally against `wrangler dev` and
  `supabase functions serve`; the deploy gate blocks until the account exists.
