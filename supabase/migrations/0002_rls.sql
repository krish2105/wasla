-- Row Level Security for every table created in 0001_init.sql.
-- service_role bypasses RLS entirely; these policies govern the anon and
-- authenticated roles the app actually uses.

alter table public.profiles    enable row level security;
alter table public.jobs        enable row level security;
alter table public.matches     enable row level security;
alter table public.match_audit enable row level security;

-- ── profiles ──────────────────────────────────────────────
-- Week 1 is deliberately own-row only, which is what the two-account isolation
-- test proves. People search (Week 3) needs a discovery policy; that lands as
-- its own migration, not an edit to this one.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert policy: rows come from the handle_new_user() trigger, which runs
-- security definer. No delete policy: deleting auth.users cascades.

-- ── jobs ──────────────────────────────────────────────────
-- A job board nobody can browse is useless, so reads are open to any signed-in
-- user. Writes are the poster's alone.
create policy jobs_select_authenticated on public.jobs
  for select to authenticated
  using (true);

create policy jobs_insert_own on public.jobs
  for insert to authenticated
  with check (auth.uid() = posted_by);

create policy jobs_update_own on public.jobs
  for update to authenticated
  using (auth.uid() = posted_by)
  with check (auth.uid() = posted_by);

create policy jobs_delete_own on public.jobs
  for delete to authenticated
  using (auth.uid() = posted_by);

-- ── matches ───────────────────────────────────────────────
-- Your scores against jobs are yours. Writes come from the Edge Function using
-- service_role, so there is no insert or update policy here.
create policy matches_select_own on public.matches
  for select to authenticated
  using (auth.uid() = profile_id);

-- ── match_audit ───────────────────────────────────────────
-- Raw rows are per-person and stay private. The Week 6 bias dashboard reads
-- aggregates through a security definer function, never this table directly.
create policy match_audit_select_own on public.match_audit
  for select to authenticated
  using (auth.uid() = profile_id);
