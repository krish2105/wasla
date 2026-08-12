# PROJECT: WASLA
### An AI-native professional network for GCC expats
**Master Build Plan — End-to-End | $0 Infrastructure | Expo (iOS + Android + Web)**

Prepared for: Krishna Mathur
Constraints: Strictly $0 budget (no store fees) · 20+ hrs/week · 8-week sprint
Hardware: MacBook Pro M4 Pro (primary dev) + Windows RTX PC (Android release builds)

---

## PART 0 — THE HONEST FRAMING (read this first)

You are **not** building a LinkedIn clone. You are building a *narrow, opinionated, AI-first* professional network that solves problems LinkedIn structurally refuses to solve, for a market LinkedIn under-serves (GCC expat job seekers).

Why this framing matters for your actual goal — a Dubai AI/ML role:

| A "LinkedIn clone" says | "Wasla" says |
|---|---|
| I can build CRUD + auth | I can define a product wedge and defend it |
| I used an LLM API | I built a retrieval + ranking + evaluation system |
| Here's my app | Here's the bias audit on my own matching algorithm |

The third row is your differentiator. Almost nobody in a UAE interview loop has shipped a *self-audited* ranking system. That is the artifact.

**Name:** WASLA (وصلة — "a connection / a link"). Short, GCC-resonant, unclaimed, pronounceable in English and Arabic.

---

## PART 1 — PROBLEM STATEMENT

### 1.1 The user problem
A candidate in (or moving to) the UAE faces four failures that LinkedIn does not address:

1. **Ghost jobs.** A large share of GCC postings are pipeline-building, already-filled, or agency bait. Candidates burn weeks applying into voids with zero signal.
2. **Visa opacity.** Postings almost never state whether they sponsor, whether they require a transferable visa, or whether "local candidates only" is real. This is *the* single highest-friction filter for expats and it does not exist as a field anywhere.
3. **Salary blackholes.** GCC compensation is tax-free and wildly variable; candidates negotiate blind.
4. **Keyword-match hiring.** ATS matching is lexical. "Agentic RAG" ≠ "retrieval-augmented generation" to a keyword matcher, so real skill is invisible.

### 1.2 The engineering problem
Semantic matching between two unstructured text corpora (profiles ↔ job descriptions), with:
- explainable scores (not a black-box number),
- measurable fairness across candidate subgroups,
- sub-second retrieval at zero infrastructure cost,
- graceful degradation when free-tier LLM quotas exhaust.

That second list is what makes this an ML systems project rather than a CRUD app.

---

## PART 2 — PRODUCT SPEC

### 2.1 Feature tiers

**P0 — Ships by Week 8 (non-negotiable MVP)**

| # | Feature | Why it's P0 |
|---|---|---|
| 1 | Auth (email + magic link) | Table stakes; no SMS (SMS costs money) |
| 2 | Profile: resume upload → auto-structured profile | First AI wow-moment, <60s to value |
| 3 | Job posting + browse | The supply side |
| 4 | Hybrid semantic search (jobs + people) | Core retrieval system |
| 5 | Match score with gap explanation | Core ranking system |
| 6 | Visa/relocation status as a **first-class field** | The wedge |
| 7 | Ghost-job risk score | The wedge |
| 8 | Bias audit dashboard | The portfolio artifact |

**P1 — If time allows (Week 7–8 stretch)**

| # | Feature |
|---|---|
| 9 | Feed with embedding-based ranking (no engagement-max) |
| 10 | Agentic application copilot (tailored cover letter + ATS keyword diff) |
| 11 | Voice interview simulator (on-device STT/TTS) |
| 12 | Crowdsourced salary bands by role × years × emirate |

**P2 — Roadmap only (put in README, do not build)**
Messaging, connections graph, proof-of-work verification (GitHub/Kaggle OAuth), recruiter response-rate scoring, Arabic RTL localisation, company pages.

> **Karpathy rule applied:** Anything in P2 that you start building in Week 3 is what kills this project. Write P2 in the README so the ambition is *visible* without being *built*.

### 2.2 Explicit non-goals
- No real-time chat (Supabase Realtime free tier is 200 concurrent — fine, but chat is a time sink with zero AI story).
- No payments. No monetisation. Portfolio-first.
- No web scraping of real LinkedIn/Bayt/GulfTalent. Legal risk + ToS violation + it will come up in an interview and you will lose. Seed synthetically (Part 7).

---

## PART 3 — THE AI LAYER (this is the product, not a feature)

Each feature below maps to a *named technique* you can defend in a viva.

| Feature | Technique | Free implementation |
|---|---|---|
| Resume → structured profile | Multimodal document extraction + constrained JSON output | Gemini Flash (PDF input native, 1M ctx) |
| Job/people search | **Hybrid retrieval**: dense (pgvector cosine) + sparse (Postgres `tsvector`), fused by **Reciprocal Rank Fusion** | pgvector in Supabase; embeddings via Gemini or Cloudflare Workers AI `bge-m3` |
| Match score | Bi-encoder retrieve → LLM cross-encoder rerank top-20 → structured gap output | Groq (fast, cheap on tokens) |
| Gap explanation | Constrained generation: `{have[], missing[], adjacent[], evidence[]}` — every claim must cite a profile span | Prompt-level grounding + span validation in code |
| Ghost-job risk | Stage 1: deterministic rules. Stage 2: LLM-as-judge. Stage 3: logistic regression on labelled outcomes | scikit-learn, exported to ONNX or just a Postgres function |
| Feed ranking | Embedding similarity to interest vector + recency decay + **diversity penalty (MMR)** | Pure SQL + pgvector |
| Bias audit | Demographic parity difference + equalised odds on match scores across proxy cohorts | Python notebook → static dashboard |
| Interview simulator | STT → LLM → TTS loop with rubric-based scoring | `expo-speech` (free TTS), on-device STT |

### 3.1 The multi-provider LLM router (critical design)

Free tiers are **rate-limited, not free-unlimited**. Verified August 2026:

| Provider | Free allowance | Card required | Role in your stack |
|---|---|---|---|
| Google AI Studio (Gemini Flash) | ~1,500 req/day, 1M context, multimodal | No | **Primary** — resume parsing, long context |
| Groq | ~30 req/min, very high throughput | No | **Fast lane** — reranking, short calls |
| Cerebras | High daily token allowance | No | Fallback |
| Cloudflare Workers AI | 10,000 neurons/day | No | **Embeddings at the edge** |
| OpenRouter free slots | Varies by upstream | No | Last-resort fallback |

**Architecture decision:** never call a provider directly from the app. Route everything through a single Cloudflare Worker that:
1. Tries providers in priority order, fails over on 429.
2. Caches identical prompts by hash (huge quota saver — resume parses repeat constantly in testing).
3. Enforces a per-user daily budget.
4. **Supports BYOK** — a user pastes their own Gemini key and gets unmetered access.

BYOK is the single smartest line in this architecture. It means your inference cost stays exactly $0 no matter how many users you get, and it's a genuinely good answer to "how would you scale this?"

---

## PART 4 — TECH STACK ($0, verified August 2026)

| Layer | Choice | Free tier reality |
|---|---|---|
| App framework | **Expo SDK 55 / RN 0.83 / TypeScript** | SDK is free forever; New Architecture mandatory |
| Routing | Expo Router v7 (file-based, universal) | Free — gives you web for free from the same code |
| Styling | NativeWind v4 (Tailwind for RN) | Free |
| Animation | Reanimated 4 + Gesture Handler | Free |
| State/data | Zustand + TanStack Query v5 | Free |
| Backend | **Supabase Free** | 500 MB Postgres, 1 GB storage, 5 GB egress, 50k MAU, 200 realtime conns, 500k edge invocations, **2 projects** |
| Vector DB | **pgvector** inside Supabase | Free — no separate vector DB, no Pinecone bill |
| Media/CDN | **Cloudflare R2** | 10 GB storage, **zero egress fees** — this is why not Supabase Storage for images |
| AI gateway | Cloudflare Workers | 100k requests/day |
| Embeddings | Workers AI `bge-m3` or Gemini embeddings | 10k neurons/day |
| Push | Expo Push Notifications | Free |
| Web hosting | Cloudflare Pages | Free, unlimited bandwidth |
| CI/CD | GitHub Actions | 2,000 min/mo private, unlimited public |
| Errors | Sentry free tier | 5k events/mo |
| Analytics | PostHog free tier | 1M events/mo |

### 4.1 Two traps that will bite you

1. **Supabase pauses free projects after 7 days of inactivity.** Your demo will be dead the day a recruiter opens it. Fix in Week 1: a GitHub Actions cron that pings the project every 6 hours. Ten lines of YAML. Do not skip this.
2. **You get 2 free Supabase projects.** Use one for `wasla-dev`, one for `wasla-prod`. That is your entire environment budget — no staging. Plan migrations accordingly.

---

## PART 5 — THE $0 DISTRIBUTION PLAYBOOK

This is where your budget answer forces real creativity, and it's the part most people get wrong.

**The blunt truth:** at $0 you cannot publish to the App Store ($99/yr) or Google Play ($25 one-time). So distribution is not "launch" — it's **portfolio surface area**. Here's how to maximise it for free.

### 5.1 Web PWA — your hero surface ⭐
Expo Router is universal. `npx expo export --platform web` gives you a static site. Deploy to Cloudflare Pages (free, unlimited bandwidth). Add a web manifest and service worker.

**Result:** `wasla.pages.dev` — a link you paste into your resume, LinkedIn, and every job application. Recruiters open it in one click, no install. iOS users tap Share → *Add to Home Screen* and get a near-native app icon and full-screen experience with **zero Apple fees**.

This is your primary distribution channel. Treat the web build as a first-class target from Week 1, not an afterthought in Week 8.

### 5.2 Android — free, legitimately
Two moving parts:

- **Build locally, not on EAS.** `npx expo run:android --variant release` on your Windows RTX PC produces a signed APK without spending EAS build credits. Host it on **GitHub Releases** (free, permanent, CDN-backed).
- **Register a free Android Developer Console account.** Google now requires developer verification even for sideloaded apps, but there is a *limited distribution* account type with **no registration fee, no government ID, and no Play Console needed** — it allows distribution of unlimited apps to **up to 20 devices**.

Timeline you should know: developer verification tools opened globally in March 2026; the advanced sideloading flow launched August 2026; enforcement begins **September 30, 2026** in Brazil, Indonesia, Singapore and Thailand, expanding globally in 2027. **The UAE is not in the first enforcement wave**, so direct APK install works normally there for now — but register the free limited-distribution account anyway so you're future-proof and can say so in an interview.

20 devices is plenty for: you, 12 friends, 3 recruiters, and a few classmates.

### 5.3 iOS — free, with honest limits
- **Development:** Expo Go on your own iPhone for daily work. Free.
- **Native build on device:** Xcode free provisioning with your Apple ID signs a build onto your own device. The certificate expires every **7 days** and must be re-signed. Fine for recording a demo video; useless for distribution.
- **TestFlight requires the $99 membership.** There is no free path around this. Accept it.

### 5.4 What you actually put on your resume
```
Wasla — AI-native professional network (Expo · Supabase · pgvector · multi-provider LLM router)
  Live web app:  https://wasla.pages.dev
  Android APK:   https://github.com/krish2105/wasla/releases
  Demo video:    2-min walkthrough (iOS native build)
  Source + docs: https://github.com/krish2105/wasla
```
That reads better than "published on Play Store," honestly. The bias-audit dashboard being publicly viewable is worth more than a store listing.

**Upgrade trigger:** the day you have a real user asking for it, pay the $25 for Google Play. Not before.

---

## PART 6 — ARCHITECTURE & DATA MODEL

### 6.1 System diagram

```
┌────────────────────────────────────────────────────────┐
│  Expo App (iOS · Android · Web PWA) — one codebase      │
│  Expo Router v7 · NativeWind · Zustand · TanStack Query │
└───────────────┬────────────────────────────────────────┘
                │ supabase-js (JWT, RLS-enforced)
                ▼
┌────────────────────────────────────────────────────────┐
│  SUPABASE (Postgres 15 + pgvector)                      │
│  ├─ Auth (magic link)                                   │
│  ├─ Tables + Row Level Security                         │
│  ├─ tsvector FTS  +  vector(768) HNSW index             │
│  ├─ RPC: hybrid_search() — RRF fusion in SQL            │
│  └─ Edge Functions (Deno): parse_resume, score_match     │
└───────────────┬────────────────────────────────────────┘
                │ fetch
                ▼
┌────────────────────────────────────────────────────────┐
│  CLOUDFLARE WORKER — "ai-gateway"                       │
│  ├─ Provider router: Gemini → Groq → Cerebras → OR      │
│  ├─ Prompt-hash response cache (KV)                     │
│  ├─ Per-user daily quota + BYOK passthrough             │
│  └─ Workers AI: bge-m3 embeddings                       │
└────────────────────────────────────────────────────────┘
                │
                ▼
        Cloudflare R2 (avatars, resume PDFs — zero egress)
```

### 6.2 Core schema (run this in Week 1)

```sql
-- ── Extensions ────────────────────────────────────────────
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ── Profiles ──────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  full_name     text not null,
  headline      text,
  summary       text,
  years_exp     numeric(4,1),
  location_city text,
  -- THE WEDGE: visa status as a first-class, queryable field
  visa_status   text check (visa_status in
                  ('citizen','transferable','non_transferable',
                   'golden','student','needs_sponsorship','outside_gcc')),
  open_to_relocate boolean default false,
  skills        text[]      default '{}',
  -- Retrieval columns
  embedding     vector(768),
  fts           tsvector generated always as (
                  to_tsvector('english',
                    coalesce(headline,'') || ' ' ||
                    coalesce(summary,'') || ' ' ||
                    array_to_string(skills,' '))
                ) stored,
  created_at    timestamptz default now()
);
create index on profiles using hnsw (embedding vector_cosine_ops);
create index on profiles using gin  (fts);

-- ── Jobs ──────────────────────────────────────────────────
create table jobs (
  id             uuid primary key default gen_random_uuid(),
  posted_by      uuid references profiles(id) on delete cascade,
  title          text not null,
  company        text not null,
  description    text not null,
  city           text,
  -- Wedge fields LinkedIn does not have
  sponsors_visa            boolean,
  requires_transferable    boolean,
  salary_min_aed           int,
  salary_max_aed           int,
  -- Ghost-job signals
  ghost_risk        numeric(3,2),          -- 0.00 – 1.00
  ghost_reasons     jsonb default '[]',
  reposted_count    int  default 0,
  first_posted_at   timestamptz default now(),
  is_active         boolean default true,
  embedding      vector(768),
  fts            tsvector generated always as (
                   to_tsvector('english',
                     coalesce(title,'') || ' ' ||
                     coalesce(company,'') || ' ' ||
                     coalesce(description,''))
                 ) stored
);
create index on jobs using hnsw (embedding vector_cosine_ops);
create index on jobs using gin  (fts);

-- ── Match results (cached, so you never re-pay for inference) ──
create table matches (
  profile_id   uuid references profiles(id) on delete cascade,
  job_id       uuid references jobs(id)     on delete cascade,
  score        numeric(4,3) not null,        -- 0.000 – 1.000
  have         jsonb default '[]',
  missing      jsonb default '[]',
  adjacent     jsonb default '[]',
  model_used   text,
  computed_at  timestamptz default now(),
  primary key (profile_id, job_id)
);

-- ── Fairness audit log — the portfolio artifact ────────────
create table match_audit (
  id           bigserial primary key,
  profile_id   uuid,
  job_id       uuid,
  score        numeric(4,3),
  -- self-reported, optional, never used as a model input
  cohort_visa  text,
  cohort_yoe_bucket text,
  cohort_region     text,
  created_at   timestamptz default now()
);
```

### 6.3 Hybrid search — the function that carries the whole product

```sql
-- Reciprocal Rank Fusion of dense + sparse retrieval.
-- k=60 is the standard RRF constant from the original paper.
create or replace function hybrid_search_jobs(
  query_text  text,
  query_vec   vector(768),
  match_count int default 20
)
returns table (id uuid, title text, company text, rrf_score numeric)
language sql stable as $$
with dense as (
  select j.id, row_number() over (order by j.embedding <=> query_vec) as rank
  from jobs j
  where j.is_active and j.embedding is not null
  order by j.embedding <=> query_vec
  limit match_count * 2
),
sparse as (
  select j.id,
         row_number() over (
           order by ts_rank_cd(j.fts, websearch_to_tsquery('english', query_text)) desc
         ) as rank
  from jobs j
  where j.is_active
    and j.fts @@ websearch_to_tsquery('english', query_text)
  limit match_count * 2
)
select j.id, j.title, j.company,
       (coalesce(1.0/(60 + d.rank), 0) + coalesce(1.0/(60 + s.rank), 0))::numeric as rrf_score
from jobs j
left join dense  d on d.id = j.id
left join sparse s on s.id = j.id
where d.id is not null or s.id is not null
order by rrf_score desc
limit match_count;
$$;
```

**Why this matters in an interview:** you can explain *why* pure vector search fails ("Python" and "Java" are close in embedding space) and *why* pure keyword search fails ("agentic RAG" ≠ "retrieval-augmented generation"), and show the fusion that fixes both. That is a real ML-engineering answer.

---

## PART 7 — COLD START: SEED DATA WITHOUT SCRAPING

Do not scrape LinkedIn, Bayt, or GulfTalent. ToS violation, legal exposure, and it will be asked about.

**Do this instead:**

1. **Synthetic generation with a real skeleton.** Pull genuinely public, licence-clean sources for *structure*: ESCO / O*NET occupation taxonomies (open data) for job titles and skill ontologies.
2. Generate ~500 job postings and ~300 profiles with Gemini, varying: seniority, industry, emirate, visa requirements, salary bands, and — critically — **deliberately planted ghost-job signals** (vague description, no salary, reposted 6x, generic company, "always hiring").
3. **Hand-label 100 of them** for ghost-risk. This becomes your evaluation set. Hand-labelling is not busywork — it is the thing that lets you report a real F1 score instead of a vibe.
4. Store the generation prompts in `/seed/prompts/` and commit them. Reproducible data generation is itself a portfolio signal.

**Label your synthetic data as synthetic, in the UI.** A small "Demo data" badge. Integrity costs you nothing and protects you if a recruiter assumes it's real.

---

## PART 8 — THE 8-WEEK SPRINT PLAN

~20 hrs/week × 8 = ~170 hours. Each week has a **verify** gate; do not advance until it's green.

### Week 1 — Foundations (skeleton that deploys)
- Expo SDK 55 + Router v7 + NativeWind + TypeScript strict mode
- Supabase project ×2 (dev/prod), schema from §6.2 applied via migration files
- Supabase Auth magic link, RLS policies on every table
- GitHub Actions: keep-alive cron + web build → Cloudflare Pages
- **Verify:** a stranger can open `wasla.pages.dev` on a phone, sign up, and see an empty profile. RLS blocks cross-user reads (test it with two accounts).

### Week 2 — Profile + the first AI moment
- Cloudflare Worker `ai-gateway` with Gemini→Groq→Cerebras failover + KV cache
- Resume PDF upload → R2 → Edge Function → Gemini structured extraction → profile
- Manual edit/override UI (never trust extraction blindly)
- Embedding generation on profile save
- **Verify:** upload a real resume (yours), get a populated profile in <30s, with every field editable. Kill the Gemini key and confirm Groq takes over.

### Week 3 — Jobs + hybrid search
- Job create/browse/detail screens
- `hybrid_search_jobs()` RPC wired to a search bar with debounce
- Visa/relocation filters as first-class UI
- **Verify:** searching "agentic RAG" returns a job whose description says only "retrieval-augmented generation agents" — proving dense retrieval works. Searching an exact rare token (a company name) returns it — proving sparse retrieval works.

### Week 4 — Match engine + explainability
- Top-20 retrieve → LLM cross-encoder rerank → structured `{have, missing, adjacent}`
- **Span grounding:** every "have" claim must quote a substring that actually exists in the profile; validate in code and drop hallucinated claims
- Cache to `matches` table; write to `match_audit`
- **Verify:** 20 hand-checked match explanations, zero ungrounded claims. Log the drop rate — that number is your hallucination-suppression metric and it belongs in your README.

### Week 5 — Ghost-job detector
- Stage 1: deterministic rules (no salary, repost count, description length, boilerplate n-grams)
- Stage 2: LLM-as-judge with a rubric
- Stage 3: logistic regression over both, trained on your 100 hand-labels
- Risk badge + expandable reasons in the job card
- **Verify:** report precision/recall/F1 on a held-out split. Even F1 = 0.72 is a real result. Put the confusion matrix in the README.

### Week 6 — Bias audit dashboard ⭐
- Compute demographic-parity difference and equalised-odds gap on match scores across cohorts (visa status, years-of-experience bucket, region)
- Render as an in-app screen (Victory Native or plain SVG) — **publicly viewable**
- Write an honest paragraph: what you found, what you can't detect, what a real audit would need
- **Verify:** the dashboard shows a *real* disparity you did not engineer away, and you can explain its likely cause.

> This week is the reason you're building this app. Do not cut it. If you're behind schedule, cut the feed (Week 7), not this.

### Week 7 — P1 features (take what fits)
Priority order: application copilot → feed ranking with MMR diversity → salary bands → interview simulator. Take the first two, stop.
- **Verify:** feed shows visible topical diversity, not 10 near-duplicate posts. Demonstrate MMR on/off side by side.

### Week 8 — Ship + package
- Empty states, error states, loading skeletons, offline handling
- Web PWA manifest + service worker + Add-to-Home-Screen prompt
- Signed release APK → GitHub Releases; register free Android limited-distribution account
- iOS native build via free provisioning → record 2-min demo video
- README with architecture diagram, metrics table, limitations section
- Sentry + PostHog live
- **Verify:** hand your phone to someone who has never seen it and say nothing. Watch where they get stuck. Fix the top two things. That's the whole test.

---

## PART 9 — MASTER BUILD PROMPT

Paste this into Claude Code at the repo root to bootstrap.

```
You are the lead engineer on WASLA, an AI-native professional network for GCC
expat job seekers. Build it as a single Expo universal app targeting iOS,
Android, and Web from one codebase.

STACK (do not substitute without telling me why):
- Expo SDK 55, React Native 0.83, TypeScript strict, Expo Router v7
- NativeWind v4, Reanimated 4, Zustand, TanStack Query v5
- Supabase (Postgres 15 + pgvector + Auth + Edge Functions, Deno)
- Cloudflare Worker as the sole AI gateway; Cloudflare R2 for files
- Zero paid services. If a task requires a paid tier, STOP and tell me.

ARCHITECTURE RULES:
1. The app NEVER calls an LLM provider directly. All inference goes through
   the Cloudflare Worker at /ai, which routes Gemini -> Groq -> Cerebras ->
   OpenRouter on 429, caches by prompt hash in KV, and supports user-supplied
   API keys (BYOK) via an X-User-Key header.
2. Every table has Row Level Security. Write the policy in the same migration
   as the table. No table ships without a policy.
3. All retrieval goes through the hybrid_search_* SQL functions using
   Reciprocal Rank Fusion. No client-side ranking.
4. Every LLM claim about a user's profile must be grounded: the model returns
   an evidence span, and code verifies that span exists in the source text
   before display. Ungrounded claims are dropped and counted in a metric.

WORKING STYLE (important):
- State assumptions explicitly before implementing. If a requirement has two
  readings, present both and ask -- do not pick silently.
- Write the minimum code that solves the problem. No speculative abstractions,
  no configurability I did not ask for, no error handling for impossible cases.
  If it's 200 lines and could be 50, rewrite it.
- Make surgical changes. Do not refactor or reformat adjacent code. Match the
  existing style even if you would do it differently.
- For every task, first state a short plan as
  "1. [step] -> verify: [check]" and then execute it. Every task must end in a
  verifiable check I can run, not "it should work now."
- If you are confused, stop and say what is confusing. Do not guess.

START HERE:
Scaffold the project, apply the schema I will paste next, wire Supabase magic-
link auth, and get a deployable web build to Cloudflare Pages. Nothing else
until `wasla.pages.dev` loads a login screen on a real phone.
```

---

## PART 10 — EVALUATION (what turns this into an ML project)

Report these in the README. Numbers, not adjectives.

| Metric | How you measure it | Target |
|---|---|---|
| Retrieval Recall@10 | 50 hand-written queries with known-relevant jobs | > 0.80 |
| Hybrid vs dense-only lift | Same 50 queries, RRF off vs on | Report the delta, whatever it is |
| Hallucination drop rate | % of LLM "have" claims failing span validation | Report it; lower is better |
| Ghost-job F1 | Held-out 30 of your 100 labels | > 0.70 |
| Demographic parity diff | Max score gap across visa cohorts | Report + interpret |
| P95 search latency | PostHog timing | < 800 ms |
| Cost per 1,000 matches | Track it | $0.00 |

That last row is a flex. Say it out loud in interviews.

---

## PART 11 — LIMITATIONS (write these honestly in the README)

1. **Synthetic data.** Ghost-job F1 is measured on generated postings with planted signals; real-world performance is unvalidated and likely lower.
2. **Fairness proxies are weak.** Visa status and region are coarse proxies for the attributes that actually matter. Real fairness auditing needs consented demographic data this app does not collect.
3. **Free-tier ceilings.** 500 MB Postgres caps at roughly 50k profiles with 768-dim embeddings. 200 concurrent realtime connections caps live features.
4. **No iOS store distribution** at $0. PWA is a good substitute but lacks background tasks and some native APIs.
5. **Embedding model is general-purpose.** A domain-tuned encoder on recruitment text would outperform `bge-m3` substantially.
6. **Cold start is unsolved.** A network product with no network is a demo. Be upfront about this rather than pretending otherwise.

---

## PART 12 — INTERVIEW / VIVA Q&A

**Q: Why hybrid retrieval instead of just vector search?**
Dense embeddings capture semantics but lose exact-token precision — rare entities, product names, and acronyms get smeared. Sparse BM25/FTS nails exact matches but fails on paraphrase. RRF fuses both rank lists without needing to normalise incomparable score scales, which is why I chose it over weighted score blending.

**Q: How do you stop the LLM from hallucinating skills onto a candidate?**
Structural, not prompt-level. The model must return an evidence span for every claim; code then verifies that span is a literal substring of the source profile. Failures are dropped and counted. I report the drop rate as a metric rather than assuming the prompt worked.

**Q: Your bias audit shows a disparity. Why ship it?**
Because hiding it would be the actual failure. The disparity is informative: it tells me my scoring inherits structure from the descriptions themselves. Publishing it, explaining the likely cause, and stating what I can't detect is more useful than a dashboard engineered to show zeros.

**Q: How would this scale past the free tier?**
Three levers, in order. First, BYOK already makes inference cost user-borne. Second, embeddings move to a batch job with a quantised local encoder — no per-call cost at all. Third, Postgres is the only thing that genuinely needs money: at ~50k profiles I'd move to a $25 Supabase Pro instance or self-host with pgvector. The architecture doesn't change; only the instance size does.

**Q: Isn't this just a LinkedIn clone?**
It shares a category, not a design. LinkedIn optimises engagement; I optimise match honesty. Three features here are ones LinkedIn structurally won't build — ghost-job risk scoring, visa status as a queryable field, and a public audit of my own ranking algorithm — because each of them reduces the volume of activity on the platform.

**Q: Why Expo over Flutter?**
Team-of-one with a TypeScript and React background, and I needed web as a distribution channel because I had a $0 budget and couldn't pay Apple. Expo Router gives me iOS, Android, and a PWA from one codebase. If the requirement had been pixel-identical custom rendering or heavy 60fps custom graphics, Flutter would have been the better call.

---

## PART 13 — WHAT TO SUBMIT / PORTFOLIO PACKAGE

- [ ] Public GitHub repo `krish2105/wasla` — README with architecture diagram, metrics table, honest limitations
- [ ] Live PWA on Cloudflare Pages
- [ ] Signed APK on GitHub Releases
- [ ] 2-minute demo video (iOS native build, screen-recorded)
- [ ] `/docs/EVALUATION.md` — the metrics table with methodology
- [ ] `/docs/BIAS_AUDIT.md` — the fairness writeup
- [ ] `/seed/prompts/` — reproducible synthetic data generation
- [ ] One LinkedIn post about the bias audit specifically, not the app generally

That last item is deliberate. "I built an app" gets scrolled past. "I audited my own hiring algorithm for bias and here's what I found" gets read by exactly the people who hire for AI roles in Dubai.

---

## IMMEDIATE NEXT STEPS (this week)

1. `npx create-expo-app@latest wasla --template` and create both Supabase projects
2. Apply the Week 1 schema and the keep-alive cron **before anything else**
3. Register the free Android Developer Console limited-distribution account
4. Get Gemini + Groq API keys (neither needs a card)
5. Ship a login screen to `wasla.pages.dev` by Sunday

Nothing in Weeks 2–8 matters if Week 1's deploy pipeline isn't green.
