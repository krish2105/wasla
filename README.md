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
```

## Setup checklist — steps only you can do

Claude Code cannot create accounts or generate keys. Nothing below is optional
for a working deploy.

### 1. Local environment

- [ ] `cp .env.example .env` and fill in at least `EXPO_PUBLIC_SUPABASE_URL`
      and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The app throws a named error without
      them. `.env` is gitignored.
- [ ] `npm i -g supabase` (the CLI is not installed on this machine yet).

### 2. Supabase

- [ ] Create projects `wasla-dev` and `wasla-prod`. That is your entire
      environment budget — the free tier allows exactly 2.
- [ ] Copy Project URL + anon key into `.env` (dev) and GitHub secrets (prod).
- [ ] `supabase link --project-ref <ref>` then `npm run db:push` to apply
      `0001_init.sql` and `0002_rls.sql`. **These have not been run yet.**
- [ ] Authentication → Providers → Email: confirm **Email OTP** is enabled.
- [ ] Authentication → Email Templates → **Magic Link**: add `{{ .Token }}` to
      the template body. The default template only contains a link; the app
      signs in with the six-digit code, so without this the email is unusable.
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

1. `npm run verify` exits 0.
2. Open the Pages URL on a phone, enter your email, receive a six-digit code,
   sign in, land on an empty profile screen.
3. Flip the phone between light and dark. The whole app restyles, and
   `npm run check:theme` proves no colour literal escaped `lib/theme.ts`.
4. Sign in as two different accounts. Neither can read the other's `profiles`,
   `matches` or `match_audit` rows.

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
