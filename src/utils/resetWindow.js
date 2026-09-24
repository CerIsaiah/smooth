/**
 * Reset-window helpers — the single source of truth for usage-day
 * boundaries on the JS side.
 *
 * Convention (shared with PR #1's Stripe lifecycle branch): a "usage day"
 * is an America/Los_Angeles calendar date, so daily counters reset at PT
 * calendar midnight — DST-safe, expressed as true UTC instants. This
 * matches the app's original product behavior (a usage day ends when the
 * user's PT day ends), with the old wall-clock-string parsing bugs fixed.
 *
 * The authoritative enforcement lives server-side in the Supabase RPCs
 * (supabase/migrations/*_atomic_usage_tracking.sql), which implement the
 * same convention in SQL. Everything that needs a reset boundary imports
 * from this module so the convention cannot drift again — do not compute
 * reset times with toLocaleString round-trips or server-local Date
 * arithmetic anywhere else.
 */

export const RESET_TIMEZONE = 'America/Los_Angeles';

/**
 * Calendar date ('YYYY-MM-DD') of an instant in the reset timezone,
 * DST-safe. en-CA yields ISO-shaped output without locale ambiguity.
 */
export function getPTDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * True UTC instant of the upcoming midnight in the reset timezone. Walks
 * forward to the first hour whose calendar date (in the reset timezone)
 * differs from today's, so DST transitions are handled by construction.
 */
export function getNextResetInstant() {
  const today = getPTDateString();
  const candidate = new Date();
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(candidate.getHours() + 1);
  while (getPTDateString(candidate) === today) {
    candidate.setHours(candidate.getHours() + 1);
  }
  return candidate;
}

/**
 * Reset is due when the stored reset happened on an earlier reset-timezone
 * calendar day than now. Unparseable stored values count as "due" so the
 * counter self-heals instead of erroring or silently never resetting.
 */
export function isPastResetTime(lastResetTime) {
  if (!lastResetTime) return true;
  const lastReset = new Date(lastResetTime);
  if (Number.isNaN(lastReset.getTime())) return true;
  return getPTDateString(lastReset) !== getPTDateString();
}
