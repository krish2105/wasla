# WASLA

An AI-native professional network for GCC expat job seekers. Built on a strictly
$0 infrastructure budget, targeting iOS, Android and web from one Expo codebase.

It is not a LinkedIn clone. It solves three things LinkedIn structurally will
not: **ghost-job risk scoring**, **visa status as a queryable field**, and a
**public bias audit of its own matching algorithm**.

Status: Week 1 of 8 — foundations. See `PROGRESS.md`.

## Stack

Expo SDK 57 · React Native 0.86 · TypeScript strict · Expo Router
NativeWind 4 (Tailwind 3) · Supabase (Postgres + pgvector + Auth)
Cloudflare Pages (web) · GitHub Actions (CI + keepalive)

## Commands

```bash
npm run dev          # expo start
npm run web          # expo start --web
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint
npm run check:theme  # fails if a colour literal escaped lib/theme.ts
npm run build:web    # expo export --platform web
npm run verify       # all of the above, in order
npm run db:push      # supabase db push
npm run db:proof     # two-account RLS isolation proof (needs supabase start)
```

## Local database

The migrations are validated against a real Postgres before they go anywhere
near a hosted project. Requires Docker (colima is fine).

```bash
npx supabase start   # applies 0001 + 0002 automatically
npm run db:proof     # 13 checks, all must pass
npx supabase stop    # when you're done
```

`npm run db:proof` creates two accounts through the real GoTrue API and asserts
that neither can read the other's `profiles`, `matches` or `match_audit` rows,
that the signup trigger fired for both, and that a signed-out caller is refused
with SQLSTATE 42501. Emails land in Mailpit at http://127.0.0.1:54324.

## Setup checklist — steps only you can do

Claude Code cannot create accounts or generate keys. Nothing below is optional
for a working deploy.

### 1. Local environment

- [ ] `.env` currently points at **local Supabase** (`npx supabase start`), which
      is what the walkthrough below was run against. Swap in the `wasla-dev`
      URL and anon key to develop against the hosted project. `.env` is
      gitignored; `.env.example` lists every name.
- [ ] Optional: `npm i -g supabase`. Every command here uses `npx supabase`,
      which works without a global install.

### 2. Supabase

- [ ] Create projects `wasla-dev` and `wasla-prod`. That is your entire
      environment budget — the free tier allows exactly 2.
- [ ] Copy Project URL + anon key into `.env` (dev) and GitHub secrets (prod).
- [ ] `npx supabase link --project-ref <ref>` then `npm run db:push` to apply
      `0001_init.sql` and `0002_rls.sql`. Both are verified against a local
      Postgres 17 but **have not been applied to a hosted project yet.**
- [ ] Authentication → Providers → Email: confirm **Email OTP** is enabled.
- [ ] Authentication → Email Templates → **Magic Link**: paste the contents of
      `supabase/templates/magic_link.html`. Verified: the stock template
      contains only a link and no `{{ .Token }}`, and the app signs in with the
      six-digit code — without this change the email is unusable.
- [ ] Authentication → URL Configuration: set **Site URL** to your Cloudflare
      Pages origin and add it to **Redirect URLs**. Only needed for the emailed
      link; the code path works without it.
- [ ] Consider custom SMTP (Resend free tier). Supabase's built-in SMTP is
      throttled to a few emails per hour on free projects, which you will hit
      while testing.

### 3. Cloudflare

- [ ] Create a Pages project named `wasla` (must match `--project-name` in
      `.github/workflows/web-deploy.yml`).
- [ ] Create an API token with Pages edit permission; note your Account ID.

### 4. GitHub

- [ ] Create the public repo and push.
- [ ] Add repository secrets: `EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`,
      `CLOUDFLARE_ACCOUNT_ID`.
- [ ] After the first scheduled run, confirm `keepalive` is green. GitHub
      disables cron workflows on repos with no commits for 60 days.

### 5. Later, not now

- [ ] `npx eas-cli@latest login` — you are not logged in, and `eas init` needs
      it. Only required when native builds start (Week 8).
- [ ] Register the free Android limited-distribution developer account.

## Week 1 verification

1. `npm run verify` exits 0. — **done**
2. `npm run db:proof` passes 13/13 against a local Postgres. — **done**
3. Sign-in flow, driven end to end in a browser against local Supabase:
   email → six-digit code from the email → signed in → profile screen showing
   the row the trigger created. Session and theme both survive a reload.
   — **done**
4. Theme switching restyles the whole app from one object swap, and
   `npm run check:theme` proves no colour literal escaped `lib/theme.ts`.
   — **done in browser**, still to confirm on a real phone
5. Open the deployed Pages URL on a phone and repeat 3 and 4 there.
   — needs a hosted project + deploy

## Design system

Twelve semantic tokens, two themes (`ink` dark / `paper` light), defined once in
`lib/theme.ts`. Components use `bg-surface`, `text-textMuted`, `border-border` —
never a hex, never a `dark:` variant. NativeWind binds the tokens as CSS
variables at the root of the tree, so switching theme swaps one object.

`npm run check:theme` fails the build if a colour literal appears anywhere else.
The single exception is `app.config.ts`, where native launch chrome (adaptive
icon, splash) must be a literal because it is baked into the binary — the check
asserts those values match `lib/theme.ts`.

## Roadmap — stated, deliberately not built

Messaging, connections graph, proof-of-work verification via GitHub/Kaggle
OAuth, recruiter response-rate scoring, Arabic RTL localisation, company pages.

Seed data is synthetic and labelled as such in the UI. No job board is scraped.
