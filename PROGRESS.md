# PROGRESS

Three lines per session: what shipped, what's broken, what's next.
Updated at the end of every session, read at the start of the next one.

## Session 1 — 2026-08-12 (Opus 5)

Shipped: Expo 57 scaffold (Router, TS strict, iOS/Android/Web), 12-token dual
         theme with a build-time hex guard, three Google fonts, magic-link
         auth with OTP verify + protected route group, 0001/0002 migrations
         applied and proven on local Postgres 17, keepalive + web-deploy
         workflows. `npm run verify` green, `npm run db:proof` 13/13.
Broken:  Nothing known. Untested: nothing has been applied to wasla-dev or
         deployed, and the app UI has not run on a real device — only the
         HTTP layer beneath it has been exercised.
Next:    Apply to wasla-dev, deploy to Pages, run it on a phone in both themes,
         then Session 2 — AI gateway Worker (Opus 5).

### Version corrections found this session

The docs were written from memory and named stale versions. Resolved live:

| docs said | actually is |
|---|---|
| Expo SDK 55 | **57.0.12** |
| React Native 0.83 | **0.86.2** |
| Expo Router v7 | **57.0.12** — Router is versioned with the SDK now |
| — | NativeWind 4.2.6 requires **Tailwind 3**, not 4 |

### Decisions that changed the plan

- `profiles.full_name` is nullable, not `not null` as in build plan Part 6.2.
  Magic-link signup writes only `auth.users`, so the `handle_new_user()` trigger
  could not have inserted a row. Approved before implementing.
- Supabase client is lazily constructed. `expo export` prerenders every route in
  Node, and supabase-js builds a RealtimeClient eagerly, which throws on
  Node < 22 (no global WebSocket).
- NativeWind tokens are bound with `vars()` at the root rather than hardcoded in
  `global.css`, which keeps `lib/theme.ts` the only source of colour.
- Week 1 `profiles` RLS is own-row only, which is what the isolation test
  proves. People search in Week 3 needs a discovery policy — new migration, not
  an edit to `0002_rls.sql`.

### Found by running it, not by reading it

- **Supabase grants no DML by default.** New public tables come with only
  REFERENCES, TRIGGER and TRUNCATE for anon/authenticated/service_role. A
  correct RLS policy still returns `42501 permission denied` without an explicit
  GRANT. 0002 now grants per role, and revokes TRUNCATE — which ignores RLS —
  from anon and authenticated.
- **`array_to_string` is STABLE**, so the Part 6.2 `profiles.fts` generated
  column fails with "generation expression is not immutable". Wrapped in an
  IMMUTABLE `immutable_array_to_string()`.
- **The stock magic-link email has no `{{ .Token }}`** — verified by reading the
  message out of Mailpit. `supabase/templates/magic_link.html` fixes it locally
  and is the exact content to paste into the dashboard.
- **Keepalive can't read a table.** Every table is denied to anon by design, so
  the cron calls a `public.keepalive()` RPC, the one thing anon may execute.
