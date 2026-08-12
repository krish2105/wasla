# WASLA — Project Instructions

AI-native professional network for GCC expat job seekers.
Solo developer, ~20 hrs/week. MacBook Pro M4 Pro; Windows RTX PC for Android
release builds.

@AGENTS.md

## Hard constraints
- **$0 budget.** If a step requires a paid tier, STOP and tell me. Never sign
  up for anything with a card.
- Free-tier ceilings that shape design decisions:
  Supabase: 500MB Postgres, 1GB storage, 5GB egress, 200 realtime connections,
  2 projects total (dev + prod, no staging).
  Gemini free: ~10 RPM is the binding limit, not the daily count. Google no
  longer publishes free-tier numbers; check the AI Studio dashboard.
  Groq: 30 RPM / 14,400 RPD, but **TPD 100K–500K is the real ceiling** for
  resume-sized payloads. Models are `openai/gpt-oss-20b` and
  `openai/gpt-oss-120b` — `llama-3.1-8b-instant` and `llama-3.3-70b-versatile`
  were shut down on 2026-08-16, free tier included.
  Cloudflare KV free: **1,000 writes/day**, 100k reads. Every cache miss that
  stores a result costs one write — this is the sharpest limit in the stack,
  and why caching is opt-in per task and quota counters live in Postgres.
  Workers AI free: 10,000 neurons/day ≈ 1.65M tokens of embedding.
- No scraping of LinkedIn, Bayt, GulfTalent, or any job board. Seed data is
  synthetic and labelled as such in the UI.

## Stack (do not substitute without telling me why)
Versions below are what `npx expo install` actually resolved on 2026-08-12.
Never hand-write a version into package.json — run `npx expo install <pkg>` and
let the SDK resolve it.

Node 22 (pinned in .nvmrc — wrangler, miniflare and unpdf all require >= 22)
Expo SDK 57.0.12 · React Native 0.86.2 · React 19.2.3 · TypeScript 6.0 strict
Expo Router 57.0.12 (versioned with the SDK now — there is no "v7")
NativeWind 4.2.6 + Tailwind 3.4 (NativeWind 4 does not support Tailwind 4)
Reanimated 4.5.1
Supabase (Postgres 15 + pgvector + Auth + Edge Functions/Deno)
Cloudflare Worker (AI gateway) · Cloudflare R2 (files) · Cloudflare Pages (web)

Planned, not yet installed: Zustand, TanStack Query v5.

## Architecture invariants — never violate
1. The app NEVER calls an LLM provider directly. All inference goes through the
   Cloudflare Worker at /ai. The failover chain is ordered config
   (`PROVIDER_ORDER`), not hardcoded branches: **Gemini → Groq today**, with
   Cerebras and OpenRouter adapters not yet written. Adding one is a file in
   `worker/src/providers/` plus a config entry — never a change to `chain.ts`.
   Failover triggers on 429, 402, 5xx and timeouts; a **400 stops the chain**
   because a malformed request does not become valid at the next provider, and
   a spent *daily* quota trips a breaker so the provider is skipped until UTC
   midnight. Responses carry `X-Wasla-Provider`, `X-Wasla-Cache` and
   `X-Wasla-Attempts`. Cache values are AES-256-GCM encrypted; an `X-User-Key`
   header (BYOK) bypasses both cache and quota.
2. Every table has a Row Level Security policy. 0001_init.sql and 0002_rls.sql
   are a matched Week 1 pair applied together; every table added after that
   carries its policy in its own migration. No table ships without one.
3. All retrieval goes through the hybrid_search_* SQL functions using
   Reciprocal Rank Fusion. No client-side ranking, ever.
4. Every LLM claim about a user's profile carries an evidence span, and code
   verifies that span is a literal substring of the source before display.
   Ungrounded claims are dropped and counted.
5. Embeddings are vector(768) from @cf/baai/bge-base-en-v1.5. Do not use bge-m3
   (1024-dim, wrong size for the schema).
6. Migrations are append-only. Never edit a migration that has been applied.

## Design invariants
- Colour comes only from semantic tokens in lib/theme.ts. A hex value anywhere
  else is a bug — `npm run check:theme` enforces this. No `dark:` variants; the
  token layer handles both themes via NativeWind `vars()` at the root.
  app.config.ts is the one exception: native launch chrome is baked into the
  binary and Expo's config loader cannot import a .ts module, so two literals
  live there and the check script asserts they match theme.ts.
- Border radius is 4px. No drop shadows. No gradients except the guilloché.
- Fonts: Bricolage Grotesque (display), Instrument Sans (body),
  Martian Mono (data/MRZ/scores).
- Red is reserved for destructive actions and errors. Ghost-job risk uses
  `stamp` violet, never red.
- Every touch target ≥ 44×44pt. Body text never below 16pt. Score is never
  communicated by colour alone.
- Copy: active voice, sentence case, no exclamation marks, no emoji. Errors
  name the cause and the fix. Empty states name the next action.

## How I want you to work
- State assumptions before implementing. Two readings of a requirement means
  you present both and ask — never pick silently.
- Minimum code that solves the problem. No speculative abstractions, no
  configurability I did not request, no error handling for impossible cases.
  200 lines that could be 50 gets rewritten.
- Surgical changes only. Don't refactor or reformat adjacent code. Match
  existing style even if you'd do it differently. Mention dead code, don't
  delete it.
- Plan before executing: give me numbered steps as "N. [step] -> verify:
  [check]" and wait for approval.
- Every task ends in a check I can run. Never "it should work now."
- Run `npx tsc --noEmit` after each file group. Don't batch type errors.
- Run migrations against the real dev database and show me the output. "This
  SQL should work" is not acceptable.
- If you're confused, stop and name what's confusing. Don't guess.

## Commands
npm run dev          # expo start
npm run web          # expo start --web
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run check:theme  # fails if a colour literal escaped lib/theme.ts
npm run build:web    # expo export --platform web
npm run verify       # check:theme + typecheck + lint + worker gates + build:web
npm run db:push      # supabase db push
npm run db:reset     # supabase db reset (DEV PROJECT ONLY)
npm run worker:dev       # wrangler dev, the AI gateway on :8787
npm run worker:test      # vitest-pool-workers
npm run worker:typecheck # the Worker is a separate tsconfig
npm run ai:proof         # live gateway checks; needs worker:dev + supabase up

## Current state
See PROGRESS.md — I update it at the end of every session. Read it first.
