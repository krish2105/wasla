# WASLA — SESSION ZERO
### Exactly what to do before and during your first Claude Code session

**Version corrections — these override the earlier documents:**
- Expo SDK **57** (not 55). Current npm: `expo@57.0.12`.
- React Native version: **do not specify it.** `create-expo-app` pairs it with the SDK automatically. Pinning it from memory is how you break the install.
- Embeddings: `@cf/baai/bge-base-en-v1.5` → **vector(768)**. Not bge-m3.

---

## PART 1 — PRE-FLIGHT (do this yourself, ~40 minutes, before opening Claude Code)

Claude Code cannot create accounts or generate keys. If these aren't ready, session 1 stalls halfway through and you waste the context.

### 1.1 Local tools

```bash
node --version     # need 20 LTS or newer
npm --version
git --version
npx supabase --version   # npm i -g supabase
gh --version             # GitHub CLI — optional but useful
```

Xcode installed from the App Store (free). Android Studio installed on the Windows PC.

### 1.2 Accounts to create — all free, none need a card

| Service | What you need from it | Where |
|---|---|---|
| **Supabase** | 2 projects: `wasla-dev`, `wasla-prod`. Copy Project URL + anon key + service_role key for each | supabase.com |
| **Cloudflare** | Account ID + API token (Workers/Pages/R2 permissions) | dash.cloudflare.com |
| **Google AI Studio** | Gemini API key — no card required | aistudio.google.com |
| **Groq** | API key — no card required | console.groq.com |
| **Cerebras** | API key (fallback) | cloud.cerebras.ai |
| **GitHub** | Empty repo `wasla`, public | github.com |
| **Android Developer Console** | Free limited-distribution account (20 devices, no ID, no fee) | android.google.com/developerconsole |

### 1.3 Connect the Expo MCP server to Claude Code

**This is the single highest-impact anti-hallucination step in the whole project.** It gives Claude live access to the real SDK 57 API surface instead of a stale memory of SDK 54.

Do it before session 1. Verify it works by asking Claude Code: *"Using the Expo MCP server, what is the current stable Expo SDK version and what React Native version does it use?"* If it answers 57 and cites the docs, you're good. If it guesses, the connection isn't live — fix that before proceeding.

### 1.4 The folder

Don't hand it a truly empty folder. Give it this:

```
wasla/
├── docs/
│   ├── 01-build-plan.md          ← WASLA_Master_Build_Plan.md
│   ├── 02-design-system.md       ← WASLA_Design_System_and_Kickoff.md
│   ├── 03-theme-and-manual.md    ← WASLA_Theme_and_ClaudeCode_Manual.md
│   └── 04-session-zero.md        ← this file
└── .env.example
```

Files in `docs/` beat chat attachments — they persist across all 18 sessions and Claude can re-read them whenever it drifts.

`.env.example` (names only, **no values** — this file gets committed):

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
GEMINI_API_KEY=
GROQ_API_KEY=
CEREBRAS_API_KEY=
```

Then: `cd wasla && git init && claude`

---

## PART 2 — THE SESSION 1 PROMPT

Paste this verbatim. Nothing else in session 1.

```
Read every file in docs/ before writing any code. They contain the product
plan, architecture, design system, and my working preferences. docs/04 has
version corrections that override the earlier files -- apply those.

You are the lead engineer. I'm a solo developer, ~20 hrs/week, on a MacBook Pro
M4 Pro, with a Windows RTX PC for Android release builds. Budget is strictly
$0. If any step requires a paid tier, STOP and tell me.

## ACCURACY RULES -- these matter more than speed

1. My docs were written partly from memory and may name stale versions. Expo
   SDK 57 is current. Trust the Expo MCP server and the live docs over anything
   in my files or your own recall.
2. NEVER hand-write a package version. Always use `npx expo install <pkg>` so
   the SDK resolves a compatible version. If a package isn't Expo-managed, check
   its actual npm latest before installing.
3. Before using any API from expo-*, nativewind, react-native-reanimated, or
   @supabase/supabase-js, verify the current signature in the real docs or in
   node_modules types. Do not write an API from memory. If you can't verify it,
   say so and ask.
4. Run `npx tsc --noEmit` after each file group. Fix errors before moving on.
   Do not batch up type errors to the end.
5. Run the migrations against the real dev database. "This SQL should work" is
   not acceptable -- execute it and show me the output.
6. If you are uncertain about anything, stop and name the uncertainty. A
   question costs one message; a wrong assumption costs an hour.

## SCOPE -- Week 1 only

Do NOT build Week 2+ features. Do NOT create placeholder files for them.

  0. CLAUDE.md at repo root, verbatim from docs/03 Part B, with versions
     corrected. Then PROGRESS.md with an empty session log.
  1. Expo SDK 57 project. TypeScript strict. Expo Router. Targets iOS, Android,
     and Web from one codebase.
  2. lib/theme.ts with the 12 semantic tokens and both value maps from docs/03
     Part A.2. NativeWind wired so `bg-surface` resolves per theme with NO
     `dark:` variants anywhere in components. Theme preference in
     expo-secure-store, three states: ink / paper / system, default system.
  3. Fonts via @expo-google-fonts: Bricolage Grotesque, Instrument Sans,
     Martian Mono.
  4. supabase/migrations/0001_init.sql -- schema from docs/01 Part 6.2 with
     embedding columns as vector(768). Then 0002_rls.sql with a Row Level
     Security policy on EVERY table. Apply both to wasla-dev and show output.
  5. Magic-link auth: login screen, verify screen, session persistence,
     protected route group.
  6. .github/workflows/keepalive.yml -- ping Supabase every 6 hours so the free
     tier never auto-pauses.
  7. .github/workflows/web-deploy.yml -- web export to Cloudflare Pages on push
     to main.
  8. package.json scripts: dev, web, typecheck, lint, db:push, verify
     (typecheck + lint + web build).
  9. README.md with a checklist of every manual step I must do myself.

## HOW TO WORK

- Minimum code that solves the problem. No speculative abstractions, no
  configurability I didn't ask for, no error handling for impossible cases.
  200 lines that could be 50 gets rewritten.
- Surgical changes. Don't refactor or reformat adjacent code.
- Border radius 4px everywhere. No drop shadows. No gradients.
- Every step ends in a check I can run myself. Never "it should work now."

## SUCCESS CRITERIA

- `npm run verify` passes clean.
- I open the deployed Cloudflare Pages URL on my phone, request a magic link,
  sign in, and land on an empty profile screen.
- Flipping my phone between light and dark restyles the entire app correctly,
  with zero hex values outside lib/theme.ts.
- Two different accounts cannot read each other's rows. Prove it to me.

## START

Give me the numbered plan as "N. [step] -> verify: [check]" and WAIT for my
approval. Do not write code until I approve the plan.
```

---

## PART 3 — DURING THE SESSION

**Read the plan properly before approving.** This is where you catch mistakes for free. Specifically check: is it using `expo install`? Is it planning to actually run the migrations? Did it invent a package you don't recognise?

**Commit at every green verify.** Not at session end.

```bash
npm run verify && git add -A && git commit -m "week1: <what shipped>"
```

**When it goes in circles twice on the same error, stop.** Read the actual error yourself, or switch to Opus. A third attempt on the same context almost never lands.

**Watch for these three specific failure signals:**

| Signal | What it means | Fix |
|---|---|---|
| Writes a version number into package.json by hand | Recalling from memory | "Use `npx expo install` and show me what version it resolved" |
| Says "this should work" without running it | Skipping verification | "Run it and paste the output" |
| Suddenly writes a file you didn't ask for | Scope creep | "That's Week 3. Delete it and stay in scope." |

---

## PART 4 — END OF SESSION

Update `PROGRESS.md`. Three lines, no more:

```markdown
## Session 1 — 2026-08-__  (Opus 5)
Shipped: Expo 57 scaffold, dual-theme tokens, magic-link auth, RLS on all
         tables, keepalive + web deploy live at wasla.pages.dev
Broken:  Theme flicker on cold start (~200ms flash of wrong theme)
Next:    Session 2 — AI gateway Worker (Opus 5)
```

Then run it on a **real phone**, not the simulator, and write down what feels wrong. That list opens session 2.

---

## PART 5 — WHAT SESSION 1 WILL NOT PRODUCE

Setting expectations so you don't think something failed:

- No job screens, no search, no AI features, no match scores
- No app icon or splash screen worth looking at
- No Android APK
- Roughly 1,500–2,500 lines of code

That is the correct outcome. Session 1's job is a deploy pipeline that's green and a schema that's sound. Everything else in this project sits on top of those two things, and both are painful to change later.

If session 1 ends with a green `npm run verify` and a working login on your phone in both themes, you are exactly on schedule.
