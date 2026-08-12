-- Per-user daily AI quota.
--
-- This lives in Postgres rather than Cloudflare KV because KV has no atomic
-- operations (a read-modify-write counter loses increments), caps at one write
-- per second per key, and allows only 1,000 writes per day on the free plan --
-- which counting alone would consume. Cloudflare's own documentation says KV
-- is the wrong fit for counters.

create table public.ai_usage (
  user_id uuid    not null references auth.users on delete cascade,
  day     date    not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- Own-row only. The gateway reads through the RPC below rather than the table,
-- but a user inspecting their own usage is legitimate.
create policy ai_usage_select_own
  on public.ai_usage for select
  using ((select auth.uid()) = user_id);

-- Supabase grants no DML on new public tables. A correct policy without an
-- explicit GRANT still returns 42501 -- proven in Week 1, see 0002_rls.sql.
grant select on public.ai_usage to authenticated;
revoke truncate on public.ai_usage from anon, authenticated;

-- No insert/update/delete grant to anyone: the counter is only ever moved by
-- the security-definer function below, so a client cannot reset its own usage.

/*
 * Consume one unit of today's quota.
 *
 * Atomic by construction: the insert-on-conflict is a single statement, and
 * the WHERE on the update clause means an over-limit request returns no row
 * instead of incrementing past the ceiling. Two concurrent callers therefore
 * cannot both be allowed through the same last unit.
 *
 * security definer with search_path = '' so a caller cannot shadow the table
 * with one of their own. The user is taken from auth.uid(), never from an
 * argument, so nobody can spend someone else's quota.
 */
create function public.consume_ai_quota(p_limit integer)
returns table (allowed boolean, used integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_day    date := (now() at time zone 'utc')::date;
  v_resets timestamptz := ((v_day + 1)::timestamp at time zone 'utc');
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'consume_ai_quota requires an authenticated caller'
      using errcode = '28000';
  end if;

  -- A limit of zero disables the gateway for metered callers. Without this the
  -- insert path below would still let the first request of each day through.
  if p_limit <= 0 then
    return query select false, 0, v_resets;
    return;
  end if;

  insert into public.ai_usage as u (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    -- The update was skipped: already at the limit. Report the current value.
    select u.count into v_count
      from public.ai_usage u
     where u.user_id = v_uid and u.day = v_day;

    return query select false, coalesce(v_count, 0), v_resets;
  end if;

  return query select true, v_count, v_resets;
end;
$$;

-- Only signed-in callers. anon must never be able to move a counter.
revoke execute on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
