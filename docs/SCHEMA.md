# SmoothRizz — Database Schema

All database access is server-side via `SUPABASE_SERVICE_ROLE_KEY` (PostgREST; RLS bypassed). The app stores application users in a custom `users` table (keyed by email), not Supabase Auth's `users`.

## `saved_responses`

One row per saved response. Created by [`supabase/migrations/20260924000000_create_saved_responses.sql`](../supabase/migrations/20260924000000_create_saved_responses.sql); backfilled from the legacy JSONB blob by [`supabase/migrations/20260924000001_backfill_saved_responses_from_users_jsonb.sql`](../supabase/migrations/20260924000001_backfill_saved_responses_from_users_jsonb.sql).

**This table is the system of record for new writes.** `users.saved_responses` (JSONB) is legacy and no longer written by the app (see [Cutover](#cutover--rollback)).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, PK | `gen_random_uuid()` |
| `user_id` | `uuid`, NOT NULL | FK → `users.id` `ON DELETE CASCADE` (assumes `users.id` is uuid, the Supabase dashboard default) |
| `response` | `text`, NOT NULL | The saved message text |
| `context` | `text` | Conversation context at generation time |
| `last_message` | `text` | Last incoming message; exposed as `lastMessage` by the API |
| `created_at` | `timestamptz`, NOT NULL | `now()`; the API honors a client-supplied value when migrating anonymous saves, so original save times survive |
| `email` | `text`, NOT NULL | Denormalized from `users.email`; lookup key for GET/DELETE |

Constraints and indexes:

- `saved_responses_user_response_created_at_key` — UNIQUE (`user_id`, `response`, `created_at`): makes the backfill idempotent (`ON CONFLICT DO NOTHING`) and collapses retried client saves into no-ops instead of duplicates.
- `idx_saved_responses_user_id` (`user_id`) — per-user `COUNT(*)` for the learning-percentage calculation.
- `idx_saved_responses_created_at` (`created_at`) — ordered listings.
- `idx_saved_responses_email` (`email`) — GET/DELETE filter by email.

RLS is enabled with no policies: anon/authenticated API keys cannot read or write the table; only the service role can.

### API behavior (`/api/saved-responses`)

Row operations only — no more read-modify-write of a whole blob, so concurrent saves can't clobber each other and the payload no longer grows unbounded.

- **GET** → ordered `SELECT` (`created_at DESC`), returns `{ responses: [{ id, response, context, lastMessage, created_at }] }` — same JSON shape the client (`src/app/saved/page.js`) reads.
- **POST** → single response = one `INSERT`; `responses: [...]` = one bulk `INSERT`. Client-supplied `created_at` is honored when it parses, otherwise the server clock.
- **DELETE** → `DELETE ... WHERE email = $caller AND (id = $id OR created_at = $timestamp)`. `id` is preferred; the `timestamp` query param is kept so the current client keeps working unchanged.

### Learning percentage

`/api/learning-percentage` (via `getLearningPercentage` in `src/utils/usageTracking.js`) counts rows with `COUNT(*)` (`head: true`) on `saved_responses` by `user_id`, then applies the same `MIN_LEARNING_PERCENTAGE` / increment / max math as before (`src/app/constants.js`). The response shape is unchanged.

## Cutover & rollback

- **Cutover:** when this ships, new writes go to the `saved_responses` table only. The `users.saved_responses` column is left in place untouched (no longer written, still readable) so pre-migration data stays inspectable. Drop the column in a later cleanup PR once the backfill is verified.
- **Backfill:** run the second migration once per environment. It is idempotent — safe to re-run (e.g., after a rollback/redeploy); it never modifies `users.saved_responses`.
- **Rollback:** revert the app commit and redeploy — the JSONB column still holds pre-cutover data, so the old code path keeps working. Saves made after cutover exist only in the table and will not reappear under the old code path (the backfill copies JSONB → table, not the reverse); if those saves must survive a rollback, restore them explicitly first.

## `users` / `ip_usage`

Unchanged by this PR; documented in the project schema artifact (`SmoothRizz docsSCHEMA.md`).
