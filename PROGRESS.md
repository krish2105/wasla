# PROGRESS

Three lines per session: what shipped, what's broken, what's next.
Updated at the end of every session, read at the start of the next one.

## Session 1 — 2026-08-12 (Opus 5)

Shipped: Expo 57 scaffold (Router, TS strict, iOS/Android/Web), 12-token dual
         theme with a build-time hex guard, three Google fonts, magic-link
         auth with OTP verify + protected route group, 0001/0002 migrations,
         keepalive + web-deploy workflows. `npm run verify` green.
Broken:  Migrations written but NOT applied — no Supabase project access yet,
         so the schema is unverified against a real Postgres. Auth is untested
         end to end for the same reason. No deploy has run.
Next:    Apply migrations to wasla-dev, prove the two-account RLS isolation,
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
