-- ===========================================================================
-- Atomic usage tracking for SmoothRizz
--
-- Why: the API's incrementUsage/checkUsageLimits did read-then-write
-- UPDATEs on `users` and `ip_usage`. Two concurrent swipes could both read
-- the same count and both write back count+1 (lost increments), and a burst
-- of parallel requests could all pass the pre-read limit check (limits
-- bypassable). Daily-reset logic mixed PST-local strings, `new Date(...)`
-- parsing and UTC ISO writes, so reset boundaries drifted.
--
-- What: transaction-safe RPC functions. Each one locks the row
-- (SELECT ... FOR UPDATE), resets daily counters when the reset-timezone
-- (America/Los_Angeles) calendar day has rolled over, enforces the daily
-- limit server-side, and increments — atomically.
-- The API calls these via supabase.rpc(...) with the service-role key;
-- counter writes from application code are removed.
--
-- Timezone convention: America/Los_Angeles (the app's original product
-- behavior). A "usage day" is an America/Los_Angeles calendar date, DST-safe,
-- expressed as true UTC instants; counters reset at PT calendar midnight.
-- The same convention is implemented in
-- src/utils/resetWindow.js — change both together or not at all.
--
-- Apply with: supabase db push (or paste into the Supabase SQL editor).
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalize column types so the functions below have one deterministic
--    contract. The app has only ever written ISO-8601 values to these
--    columns, so the USING casts are safe; if a column already has the
--    target type the ALTER is a no-op rewrite.
-- ---------------------------------------------------------------------------
alter table public.users
  alter column last_reset type timestamptz using last_reset::timestamptz,
  alter column last_used type timestamptz using last_used::timestamptz,
  alter column trial_end_date type timestamptz using trial_end_date::timestamptz,
  alter column daily_usage_history type jsonb using daily_usage_history::jsonb;

alter table public.ip_usage
  alter column last_reset type date using last_reset::date,
  alter column "date" type date using "date"::date,
  alter column last_used type timestamptz using last_used::timestamptz;

-- The IP increment relies on at-most-one row per IP for its upsert.
create unique index if not exists ip_usage_ip_address_key
  on public.ip_usage (ip_address);

-- ---------------------------------------------------------------------------
-- 2. reset_user_usage_if_stale
--
-- Archives yesterday's final count into daily_usage_history and zeroes
-- daily_usage when the reset-timezone (America/Los_Angeles) calendar day
-- has rolled over since last_reset.
-- Used by /api/usage (which reports whether a reset happened) and by
-- increment_user_usage, so the rollover logic exists exactly once.
-- The caller is expected to already hold (or take) the row lock.
-- ---------------------------------------------------------------------------
create or replace function public.reset_user_usage_if_stale(p_email text)
returns boolean
language plpgsql
as $$
declare
  v_email   text := p_email;
  v_today   date := (now() at time zone 'America/Los_Angeles')::date;
  v_row     public.users%rowtype;
  v_history jsonb;
begin
  select * into v_row from public.users where email = v_email for update;

  if not found then
    return false;
  end if;

  if v_row.last_reset is not null
     and (v_row.last_reset at time zone 'America/Los_Angeles')::date >= v_today then
    return false;  -- same reset-timezone calendar day: nothing to reset
  end if;

  v_history := coalesce(v_row.daily_usage_history, '{}'::jsonb);
  if coalesce(v_row.daily_usage, 0) > 0 then
    v_history := jsonb_set(
      v_history,
      array[to_char(v_today - 1, 'YYYY-MM-DD')],
      to_jsonb(v_row.daily_usage)
    );
  end if;

  update public.users set
    daily_usage         = 0,
    daily_usage_history = v_history,
    last_reset          = now()  -- true UTC instant (matches PR #1's write shape)
  where email = v_email;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. increment_user_usage
--
-- Atomic swipe increment for signed-in users: increment_user_usage(email, 14).
-- Returns the authoritative post-increment state; `incremented = false`
-- means the caller is at the daily limit — enforced inside the row lock, so
-- parallel requests can no longer sneak past it. Premium
-- (subscription_status = 'active') and active-trial users are unlimited,
-- matching the previous checkUsageLimits semantics. No row returned means
-- the user does not exist.
-- ---------------------------------------------------------------------------
create or replace function public.increment_user_usage(p_email text, p_daily_limit integer)
returns table (
  daily_usage integer,
  total_usage integer,
  incremented boolean,
  was_reset   boolean,
  is_premium  boolean,
  is_trial    boolean
)
language plpgsql
as $$
declare
  v_email     text    := p_email;
  v_today     date    := (now() at time zone 'America/Los_Angeles')::date;
  v_today_key text    := to_char(v_today, 'YYYY-MM-DD');
  v_row       public.users%rowtype;
  v_was_reset boolean := false;
  v_premium   boolean;
  v_trial     boolean;
  v_history   jsonb;
  v_daily     integer;
  v_total     integer;
begin
  select * into v_row from public.users where email = v_email for update;

  if not found then
    return;  -- caller falls back to its "User not found" handling
  end if;

  -- Reset-timezone (America/Los_Angeles) calendar-day rollover (shared
  -- implementation; row lock is already held, so the re-select inside sees
  -- our transaction's state).
  v_was_reset := public.reset_user_usage_if_stale(v_email);
  if v_was_reset then
    select * into v_row from public.users where email = v_email for update;
  end if;

  v_daily := coalesce(v_row.daily_usage, 0);
  v_total := coalesce(v_row.total_usage, 0);

  v_premium := coalesce(v_row.subscription_status = 'active', false);
  v_trial   := coalesce(v_row.is_trial, false) = true
               and v_row.trial_end_date is not null
               and v_row.trial_end_date > now();

  if not v_premium and not v_trial and v_daily >= p_daily_limit then
    -- At/over the limit: no increment. Decided under the row lock, so a
    -- burst of parallel requests cannot all slip through the old
    -- check-then-increment window.
    return query select v_daily, v_total, false, v_was_reset, v_premium, v_trial;
    return;
  end if;

  -- One swipe = exactly one history bump, computed in SQL so concurrent
  -- increments cannot clobber each other's history map.
  v_history := jsonb_set(
    coalesce(v_row.daily_usage_history, '{}'::jsonb),
    array[v_today_key],
    to_jsonb(coalesce((v_row.daily_usage_history ->> v_today_key)::int, 0) + 1)
  );

  update public.users set
    daily_usage         = v_daily + 1,
    total_usage         = v_total + 1,
    daily_usage_history = v_history,
    last_used           = now()
  where email = v_email;

  return query select
    (v_daily + 1)::int,
    (v_total + 1)::int,
    true,
    v_was_reset,
    v_premium,
    v_trial;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. increment_ip_usage
--
-- Atomic swipe increment for anonymous (IP-keyed) usage:
-- increment_ip_usage(ip, 14). Seeds the row on first contact, resets the
-- daily counter at reset-timezone calendar-midnight rollover (previously ip_usage rows were never reset
-- server-side), and enforces the limit under the row lock. No row returned
-- means the upsert could not establish a row (should not happen).
-- ---------------------------------------------------------------------------
create or replace function public.increment_ip_usage(p_ip text, p_daily_limit integer)
returns table (
  daily_usage integer,
  total_usage integer,
  incremented boolean,
  was_reset   boolean
)
language plpgsql
as $$
declare
  v_today     date    := (now() at time zone 'America/Los_Angeles')::date;
  v_row       public.ip_usage%rowtype;
  v_was_reset boolean := false;
  v_daily     integer;
  v_total     integer;
begin
  select * into v_row from public.ip_usage where ip_address = p_ip for update;

  if not found then
    -- First-ever swipe from this IP: seed the row in the same call.
    insert into public.ip_usage (ip_address, daily_usage, total_usage, last_used, last_reset, "date")
    values (p_ip, 1, 1, now(), v_today, v_today)
    on conflict (ip_address) do nothing;

    if found then
      return query select 1::int, 1::int, true, false;
      return;
    end if;

    -- Another request inserted the row between our SELECT and INSERT:
    -- re-read it under lock and fall through to the normal increment.
    select * into v_row from public.ip_usage where ip_address = p_ip for update;
    if not found then
      raise exception 'increment_ip_usage: no ip_usage row for % after upsert', p_ip;
    end if;
  end if;

  -- Reset-timezone (America/Los_Angeles) calendar-day rollover: zero the
  -- daily counter in the same statement as the increment so a stale count
  -- can neither block nor vanish.
  if v_row.last_reset is null or v_row.last_reset < v_today then
    v_was_reset := true;
    v_row.daily_usage := 0;
  end if;

  v_daily := coalesce(v_row.daily_usage, 0);
  v_total := coalesce(v_row.total_usage, 0);

  if v_daily >= p_daily_limit then
    return query select v_daily, v_total, false, v_was_reset;
    return;
  end if;

  v_daily := v_daily + 1;
  v_total := v_total + 1;

  update public.ip_usage set
    daily_usage = v_daily,
    total_usage = v_total,
    last_used   = now(),
    last_reset  = v_today,
    "date"      = v_today
  where ip_address = p_ip;

  return query select v_daily, v_total, true, v_was_reset;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. merge_anonymous_usage
--
-- Adds an IP's anonymous swipe count to a user's counters atomically
-- (sign-in migration of anonymous usage). Single statement, so it cannot
-- clobber a concurrent increment_user_usage call the way the old
-- read-then-write merge could.
-- ---------------------------------------------------------------------------
create or replace function public.merge_anonymous_usage(p_email text, p_anonymous_swipes integer)
returns setof public.users
language plpgsql
as $$
begin
  return query
    update public.users as u set
      daily_usage = coalesce(u.daily_usage, 0) + coalesce(p_anonymous_swipes, 0),
      total_usage = coalesce(u.total_usage, 0) + coalesce(p_anonymous_swipes, 0),
      last_used   = now()
    where u.email = p_email
    returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock down EXECUTE.
--
-- Postgres grants EXECUTE on functions to PUBLIC by default; without this,
-- anyone holding the anon key could call the RPCs through PostgREST and
-- mutate usage counters. The API invokes them with the service-role key.
-- ---------------------------------------------------------------------------
revoke execute on function public.increment_user_usage(text, integer) from public;
revoke execute on function public.increment_ip_usage(text, integer) from public;
revoke execute on function public.reset_user_usage_if_stale(text) from public;
revoke execute on function public.merge_anonymous_usage(text, integer) from public;

-- Grant to the service role only when it exists (it does on Supabase; keeps
-- the migration runnable on vanilla Postgres for local testing).
do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.increment_user_usage(text, integer) to service_role;
    grant execute on function public.increment_ip_usage(text, integer) to service_role;
    grant execute on function public.reset_user_usage_if_stale(text) to service_role;
    grant execute on function public.merge_anonymous_usage(text, integer) to service_role;
  end if;
end
$do$;
