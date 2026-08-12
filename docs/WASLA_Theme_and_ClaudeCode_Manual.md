# WASLA — Dual-Theme System & Claude Code Operating Manual
Companion to `WASLA_Master_Build_Plan.md` and `WASLA_Design_System_and_Kickoff.md`

Decisions locked: **Official Document direction** · **Both themes, equal effort** · **Built entirely in Claude Code**

---

# PART A — THE DUAL-THEME TOKEN SYSTEM

## A.1 The rule

Components **never** reference a hex value or a theme name. They reference a *semantic token*. There is exactly one place in the codebase where a hex value appears, and it is `theme.ts`.

```
❌  backgroundColor: isDark ? '#1A2C33' : '#EFF2ED'
❌  className="bg-inkSoft dark:bg-paperRaised"
✅  className="bg-surface"
```

If a reviewer can find a hex value outside `theme.ts`, the system has already failed.

## A.2 Semantic tokens (12 total — resist adding a 13th)

| Token | Job | Ink (dark) | Paper (light) | Contrast on its bg |
|---|---|---|---|---|
| `bg` | App background | `#101D22` | `#E4E8E1` | — |
| `surface` | Cards, sheets | `#1A2C33` | `#EFF2ED` | — |
| `surfaceRaised` | Modals, popovers | `#22383F` | `#F7F9F5` | — |
| `border` | Hairlines, dividers | `#7A8B8F` @ 22% | `#101D22` @ 14% | — |
| `text` | Primary copy | `#E4E8E1` | `#101D22` | 13.1 / 14.8 ✅ |
| `textMuted` | Labels, captions | `#93A3A7` | `#4C6067` | 6.2 / 7.4 ✅ |
| `stamp` | Ghost risk, cautions | `#9E8DD6` | `#5B4B8A` | 6.8 / 6.1 ✅ |
| `seal` | Verified, sponsors visa, match-positive | `#4FA88F` | `#2E7D6B` | 6.4 / 4.9 ✅ |
| `flag` | Incomplete, attention | `#D9A548` | `#8A6018` | 8.1 / 5.3 ✅ |
| `danger` | Destructive only | `#E0736B` | `#A33228` | 5.9 / 6.7 ✅ |
| `accent` | Interactive, links, focus ring | `#7FC4D9` | `#1F5F73` | 8.9 / 6.5 ✅ |
| `mrz` | The MRZ strip ground | `#0A1417` | `#DADFD5` | — |

**Corrections made from the first spec** — do not use the old values:
- `flag` in light theme: `#C08A2E` → **`#8A6018`** (original was ~2.5:1, failed)
- `stamp` in dark theme: `#5B4B8A` → **`#9E8DD6`** (original was dark-on-dark)
- `accent` is new. The first spec had no interactive colour, which meant links and focus rings would have defaulted to system blue and broken the whole language.

## A.3 The ghost stamp inverts, and that's the point

| | Paper theme | Ink theme |
|---|---|---|
| Metaphor | Violet rubber stamp on security paper | UV security ink under blacklight |
| Colour | `stamp` `#5B4B8A` @ 78% | `stamp` `#9E8DD6` @ 70% |
| Edge treatment | Eroded, ink-bleed mask | Soft outer glow, 3px, `stamp` @ 25% |
| Rotation | −6° | −6° |

Both are real security-document features, so neither theme feels like a downgraded version of the other. This is what "both themes, equal effort" actually means — not recolouring, but finding the true equivalent in each medium.

Same logic for the guilloché texture: hairlines at 4% `text` opacity in both themes, which reads as darker-on-paper and lighter-on-ink automatically.

## A.4 Implementation

Single source of truth:

```ts
// lib/theme.ts
export const themes = {
  ink: {
    bg: '#101D22', surface: '#1A2C33', surfaceRaised: '#22383F',
    border: 'rgba(122,139,143,0.22)',
    text: '#E4E8E1', textMuted: '#93A3A7',
    stamp: '#9E8DD6', seal: '#4FA88F', flag: '#D9A548',
    danger: '#E0736B', accent: '#7FC4D9', mrz: '#0A1417',
  },
  paper: {
    bg: '#E4E8E1', surface: '#EFF2ED', surfaceRaised: '#F7F9F5',
    border: 'rgba(16,29,34,0.14)',
    text: '#101D22', textMuted: '#4C6067',
    stamp: '#5B4B8A', seal: '#2E7D6B', flag: '#8A6018',
    danger: '#A33228', accent: '#1F5F73', mrz: '#DADFD5',
  },
} as const;

export type ThemeName = keyof typeof themes;
export type Token = keyof typeof themes.ink;
```

NativeWind v4 consumes it through CSS variables, so `bg-surface` resolves correctly in both themes with no `dark:` variants anywhere:

```js
// tailwind.config.js
const tokens = ['bg','surface','surfaceRaised','border','text','textMuted',
                'stamp','seal','flag','danger','accent','mrz'];

module.exports = {
  presets: [require('nativewind/preset')],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(tokens.map(t => [t, `var(--c-${t})`])),
      fontFamily: {
        display: ['BricolageGrotesque_600SemiBold'],
        body:    ['InstrumentSans_400Regular'],
        data:    ['MartianMono_500Medium'],
      },
      borderRadius: { DEFAULT: '4px', none: '0', full: '9999px' },
    },
  },
};
```

Theme preference persists in `expo-secure-store` with three states — `ink`, `paper`, `system` — defaulting to `system`. Do not build a two-state toggle; respecting the OS setting is the correct default and users who want to override will find the setting.

**Known risk:** NativeWind v4's CSS-variable support on React Native is the one part of this that may fight you. If it does, fall back to a typed `useTheme()` context returning the token object, keep NativeWind for layout utilities only, and accept the split. Do not spend more than 90 minutes on this in session 1 — it is not the interesting problem.

---

# PART B — `CLAUDE.md`

Create this at the repo root **in session 1**. Claude Code loads it automatically every session, which is how your invariants survive 18 sessions without repetition.

```markdown
# WASLA — Project Instructions

AI-native professional network for GCC expat job seekers.
Solo developer, ~20 hrs/week. MacBook Pro M4 Pro; Windows RTX PC for Android
release builds.

## Hard constraints
- **$0 budget.** If a step requires a paid tier, STOP and tell me. Never sign
  up for anything with a card.
- Free-tier ceilings that shape design decisions:
  Supabase: 500MB Postgres, 1GB storage, 5GB egress, 200 realtime connections,
  2 projects total (dev + prod, no staging).
  Gemini: ~1,500 req/day. Groq 8b-instant: 30 RPM / 14,400 RPD.
  Groq 70b-versatile: ~1,000 RPD — rerank only, cache aggressively.
- No scraping of LinkedIn, Bayt, GulfTalent, or any job board. Seed data is
  synthetic and labelled as such in the UI.

## Stack (do not substitute without telling me why)
Expo SDK 55 · React Native 0.83 · TypeScript strict · Expo Router v7
NativeWind v4 · Reanimated 4 · Zustand · TanStack Query v5
Supabase (Postgres 15 + pgvector + Auth + Edge Functions/Deno)
Cloudflare Worker (AI gateway) · Cloudflare R2 (files) · Cloudflare Pages (web)

## Architecture invariants — never violate
1. The app NEVER calls an LLM provider directly. All inference goes through the
   Cloudflare Worker at /ai, which fails over Gemini → Groq → Cerebras →
   OpenRouter on 429, caches by prompt hash in KV, and honours an X-User-Key
   header for BYOK.
2. Every table has a Row Level Security policy, written in the same migration
   as the table. No table ships without one.
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
  else is a bug. No `dark:` variants — the token layer handles both themes.
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
- If you're confused, stop and name what's confusing. Don't guess.

## Commands
npm run dev          # expo start
npm run web          # expo start --web
npm run typecheck    # tsc --noEmit
npm run db:push      # supabase db push
npm run db:reset     # supabase db reset (DEV PROJECT ONLY)

## Current state
See PROGRESS.md — I update it at the end of every session. Read it first.
```

---

# PART C — REVISED SESSION 1 PROMPT

Replaces Part B of the previous file. Attach all three markdown docs, then paste:

```
I've attached three documents: the master build plan, the design system, and
the dual-theme + operating manual. Read all three before writing code.

You are the lead engineer. Solo dev, 20 hrs/week, MacBook Pro M4 Pro, Windows
RTX PC for Android builds. Budget is strictly $0 -- if a step requires a paid
tier, STOP and tell me.

FIRST TASK: create CLAUDE.md at the repo root using Part B of the operating
manual, verbatim. Then create PROGRESS.md with an empty session log.

SCOPE -- Week 1 only. Do not build Week 2+ features and do not scaffold
placeholder files for them.

  1. Expo SDK 55 project, TypeScript strict, Expo Router v7, targeting iOS +
     Android + Web from a single codebase.
  2. lib/theme.ts with the exact 12 semantic tokens and both value maps from
     Part A.2. NativeWind v4 wired so `bg-surface` resolves per theme with no
     `dark:` variants anywhere. Theme preference in expo-secure-store with
     three states: ink / paper / system, defaulting to system.
  3. Fonts via @expo-google-fonts: Bricolage Grotesque, Instrument Sans,
     Martian Mono.
  4. Migrations: 0001_init.sql (schema from build plan Part 6.2, with
     embedding columns as vector(768)) and 0002_rls.sql with an RLS policy on
     every table.
  5. Magic-link auth: login, verify, session persistence, protected route group.
  6. .github/workflows/keepalive.yml -- ping Supabase every 6 hours so the free
     tier never auto-pauses.
  7. .github/workflows/web-deploy.yml -- web export to Cloudflare Pages on push
     to main.
  8. README with a setup checklist of every manual step I must do myself:
     accounts to create, keys to generate, secrets to set.

SUCCESS CRITERIA: I open the deployed URL on my phone, request a magic link,
sign in, and land on an empty profile screen. Switching the OS between light
and dark restyles the whole app correctly with no hardcoded colours anywhere.
Two accounts cannot read each other's rows.

Give me the numbered plan with verify steps and wait for my approval before
writing any code.
```

---

# PART D — CLAUDE CODE OPERATING MANUAL

You're driving 18 sessions. These are the habits that decide whether session 12 is productive or spent untangling session 7.

### Between every session
1. Run it on a **real device**, not just the simulator.
2. Write down what broke, in plain language.
3. Update `PROGRESS.md` — three lines: what shipped, what's broken, what's next.
4. Open the next session with that list.

That list is the project. The code is just what you use to shorten it.

### Session hygiene
- **`/clear` between vertical slices, never mid-task.** A stale context that thinks a deleted file still exists is the single most common cause of a session going sideways.
- **Always use plan mode first.** Read the plan, correct it, *then* approve. Correcting a plan costs one message; correcting an implementation costs an hour.
- **Commit at every green verify.** Not at the end of the session. If session 9 goes wrong you want to land on a working commit, not a three-hour-old one.
- **Never let it edit an applied migration.** New migration file, always. Put this in the session prompt if it tries once.
- **Two failed attempts at the same bug = stop.** Switch to Opus 5, or go read the actual error yourself. A third attempt from the same model on the same context almost never lands.

### Model routing in practice
Sessions 1, 2, 6, 9, 12, 13 are the ones where a wrong decision is expensive to unwind — schema, gateway, retrieval fusion, span grounding, the classifier, the audit. Run **Opus 5** on those. Everything else is Sonnet 5. Use Haiku 4.5 for the mechanical passes.

### The trap specific to this project
Around session 8 or 9 you will have a working search and a working match score, and it will feel finished. It isn't — the ghost detector, the bias audit, and the metrics are what make this an ML project rather than a CRUD app, and they're all after that point.

If you're behind schedule at that stage, cut the feed, cut the interview simulator, cut the salary bands. **Do not cut sessions 11–13.** Those three sessions are the reason this app gets you interviewed.
