-- Backfill: copies entries from the legacy users.saved_responses JSONB array
-- into the saved_responses table.
--
-- Idempotent: every insert is keyed on (user_id, response, created_at) — the
-- table's unique constraint — with ON CONFLICT DO NOTHING, so re-running this
-- script never inserts anything new and never duplicates rows.
--
-- Entries are skipped (left in users.saved_responses, which this script never
-- modifies) when they have no parseable ISO created_at or no response text.
-- All writer paths — the old single-save route and both client migration
-- flows — stamp new Date().toISOString(), so skipped entries should be
-- nobody in practice. A skipped entry with no timestamp cannot be given a
-- stable dedupe key, so defaulting it to now() would break idempotency.
--
-- Safe to run while the app is live and writing new rows to the table
-- directly, and safe to re-run after a rollback/redeploy.

with entries as (
  select
    u.id as user_id,
    u.email as email,
    case
      when jsonb_typeof(e.value) = 'object' then e.value ->> 'response'
      -- Historical bulk saves may have stored bare strings.
      when jsonb_typeof(e.value) = 'string' then e.value #>> '{}'
    end as response,
    case when jsonb_typeof(e.value) = 'object'
      then nullif(e.value ->> 'context', '')
    end as context,
    case when jsonb_typeof(e.value) = 'object'
      then nullif(e.value ->> 'lastMessage', '')
    end as last_message,
    case
      when jsonb_typeof(e.value) = 'object'
       and e.value ->> 'created_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
        then (e.value ->> 'created_at')::timestamptz
    end as created_at
  from public.users u
  -- Non-array / null blobs yield no rows instead of raising.
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(u.saved_responses) = 'array' then u.saved_responses
      else '[]'::jsonb
    end
  ) as e
  where jsonb_typeof(u.saved_responses) = 'array'
)
insert into public.saved_responses (user_id, email, response, context, last_message, created_at)
select
  entries.user_id,
  entries.email,
  entries.response,
  entries.context,
  entries.last_message,
  entries.created_at
from entries
where entries.response is not null
  and entries.created_at is not null
on conflict (user_id, response, created_at) do nothing;
