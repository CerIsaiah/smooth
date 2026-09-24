/**
 * UTC reset-window helpers — the single source of truth for usage-day
 * boundaries on the JS side.
 *
 * A "usage day" is a UTC calendar date; daily counters reset at 00:00 UTC.
 * The authoritative enforcement lives server-side in the Supabase RPCs
 * (supabase/migrations/*_atomic_usage_tracking.sql), which implement the
 * same convention in SQL. Everything that needs a reset boundary imports
 * from this module so the convention cannot drift again — do not compute
 * reset times with local timezones or toLocaleString anywhere else.
 */

/**
 * Returns the UTC date key ('YYYY-MM-DD') for a timestamp.
 */
export function getUtcDateKey(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Returns the next 00:00:00 UTC boundary after `from`.
 */
export function getNextUtcMidnight(from = new Date()) {
  const next = new Date(from);
  next.setUTCHours(24, 0, 0, 0); // hour 24 normalizes into the next UTC day
  return next;
}

/**
 * True when `lastReset` falls on a UTC day before `from`'s UTC day — i.e.
 * the daily counter it belongs to is stale and should be treated as 0
 * until the next increment resets it server-side.
 */
export function isUtcDayStale(lastReset, from = new Date()) {
  if (!lastReset) return true;
  const last = new Date(lastReset);
  if (Number.isNaN(last.getTime())) return true;
  return getUtcDateKey(last) < getUtcDateKey(from);
}
