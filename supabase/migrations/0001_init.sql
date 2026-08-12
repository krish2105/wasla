-- WASLA core schema.
-- Source: docs/WASLA_Master_Build_Plan.md Part 6.2. Deviations are marked DEVIATION.
-- Row Level Security for these tables is in 0002_rls.sql; the two are a matched
-- pair and must be applied together. Every table added after Week 1 carries its
-- policy in its own migration.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- array_to_string() is STABLE, not IMMUTABLE, so Postgres rejects it inside a
-- generated column. This wrapper is the standard workaround.
create or replace function public.immutable_array_to_string(arr text[], sep text)
returns text
language sql
immutable
as $$ select array_to_string(arr, sep) $$;

-- ── Profiles ──────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  -- DEVIATION: Part 6.2 has full_name NOT NULL. Magic-link signup creates an
  -- auth.users row carrying no name, so the handle_new_user() trigger below
  -- would fail and every new account would land with no profile row at all.
  -- Nullable here; the app prompts for it on the profile screen.
  full_name     text,
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
  -- Retrieval columns. vector(768) matches @cf/baai/bge-base-en-v1.5.
  embedding     vector(768),
  fts           tsvector generated always as (
                  to_tsvector('english',
                    coalesce(headline,'') || ' ' ||
                    coalesce(summary,'') || ' ' ||
                    public.immutable_array_to_string(coalesce(skills,'{}'),' '))
                ) stored,
  created_at    timestamptz default now()
);
create index profiles_embedding_idx on public.profiles using hnsw (embedding vector_cosine_ops);
create index profiles_fts_idx       on public.profiles using gin  (fts);

-- ── Jobs ──────────────────────────────────────────────────
create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  posted_by      uuid references public.profiles(id) on delete cascade,
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
create index jobs_embedding_idx on public.jobs using hnsw (embedding vector_cosine_ops);
create index jobs_fts_idx       on public.jobs using gin  (fts);

-- ── Match results (cached, so inference is never re-paid for) ──
create table public.matches (
  profile_id   uuid references public.profiles(id) on delete cascade,
  job_id       uuid references public.jobs(id)     on delete cascade,
  score        numeric(4,3) not null,        -- 0.000 – 1.000
  have         jsonb default '[]',
  missing      jsonb default '[]',
  adjacent     jsonb default '[]',
  model_used   text,
  computed_at  timestamptz default now(),
  primary key (profile_id, job_id)
);

-- ── Fairness audit log — the portfolio artifact ────────────
create table public.match_audit (
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

-- ── Profile row on signup ─────────────────────────────────
-- DEVIATION (approved): not in Part 6.2. Magic-link signup only writes
-- auth.users, so without this every account has a session but no profile row
-- and every profile read returns nothing.
-- security definer because the inserting role is the auth service, not the
-- new user; search_path is pinned empty so the function cannot be hijacked by
-- a shadowing schema, which means every reference here must be qualified.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
