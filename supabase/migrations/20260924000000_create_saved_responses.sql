-- Creates the saved_responses table: the new system of record for saved
-- responses. Replaces the users.saved_responses JSONB array, which could only
-- be read-modify-written as a whole blob (concurrent saves clobbered each
-- other and the array grew unbounded).
--
-- Assumes users.id is uuid (Supabase dashboard default: uuid default
-- gen_random_uuid()); the FK below would fail to apply if it were not.

create table if not exists public.saved_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  response text not null,
  context text,
  last_message text,
  created_at timestamptz not null default now(),
  email text not null,

  -- Makes the JSONB backfill idempotent (ON CONFLICT DO NOTHING) and blocks
  -- exact duplicate rows from retried client saves.
  constraint saved_responses_user_response_created_at_key
    unique (user_id, response, created_at)
);

comment on table public.saved_responses is
  'Saved responses, one row per swipe-right save. Owned by users.id (cascade delete). '
  || 'email is denormalized from users.email for direct lookups by the API routes.';

-- Per-user COUNT(*) for the learning-percentage calculation.
create index if not exists idx_saved_responses_user_id
  on public.saved_responses (user_id);

-- Ordered listings and future retention queries.
create index if not exists idx_saved_responses_created_at
  on public.saved_responses (created_at);

-- GET/DELETE filter by email (the routes' lookup key).
create index if not exists idx_saved_responses_email
  on public.saved_responses (email);

-- All app access goes through the service role (RLS bypassed). Enabling RLS
-- with no policies blocks anon/authenticated API keys from touching the table.
alter table public.saved_responses enable row level security;
