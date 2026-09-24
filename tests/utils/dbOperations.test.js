/**
 * Unit tests for src/utils/dbOperations.js
 *
 * Supabase is mocked at the client-creation layer (createClient) because
 * dbOperations caches its client at module scope — the fake client must exist
 * before the module is imported.
 *
 * Time handling: the module mixes PST wall-clock time with UTC encoding
 * (getCurrentPSTTime() produces a locale string in America/Los_Angeles which
 * is then re-parsed in the machine timezone and .toISOString()-ed). Vitest
 * config pins TZ=UTC, so the effective "code frame" is: PST wall readings
 * encoded as UTC. The encodePSTWallAsISO helper below produces last_reset
 * values exactly the way the production code does, keeping tests hermetic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getUserData,
  getIPUsage,
  updateIPUsage,
  createIPUsage,
  findOrCreateUser,
  getDailyUsage,
  resetDailyUsage,
  checkAndResetUsage,
  checkUsageLimits,
  incrementUsage,
} from '@/utils/dbOperations';
import { getSupabaseMock } from '../helpers/supabase-mock.js';

vi.mock('@supabase/supabase-js', async () => {
  const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
  return createSupabaseMockModule();
});

const sb = getSupabaseMock();

// Re-encodes a real UTC instant the way the production code does: takes the
// PST wall-clock reading and encodes it as UTC.
const encodePSTWallAsISO = (isoString) =>
  new Date(new Date(isoString).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).toISOString();

beforeEach(() => {
  sb.reset();
  vi.useFakeTimers();
  // Real UTC 2026-09-24T05:00Z = PST wall Sep 23 22:00 → in the code's frame
  // (PST wall encoded as UTC) "now" is 2026-09-23T22:00:00.000Z and "today"
  // is 2026-09-23 — a deliberate UTC-date ≠ code-frame-date case.
  vi.setSystemTime(new Date('2026-09-24T05:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getUserData', () => {
  it('throws when no email is provided', async () => {
    await expect(getUserData()).rejects.toThrow('Email is required');
    await expect(getUserData('')).rejects.toThrow('Email is required');
  });

  it('returns the existing user, matching on normalized (trimmed, lowercased) email', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'user@example.com',
      daily_usage: 3,
      subscription_status: 'inactive',
    });

    const user = await getUserData('  User@Example.COM ');
    expect(user.id).toBe('u1');
    expect(user.daily_usage).toBe(3);
    // No insert happened — the existing row was found.
    expect(sb.state.ops.filter((o) => o.action === 'insert')).toHaveLength(0);
  });

  it('creates a new user with defaults when none exists', async () => {
    const user = await getUserData('newuser@example.com');

    expect(user.email).toBe('newuser@example.com');
    expect(user.daily_usage).toBe(0);
    expect(user.total_usage).toBe(0);
    expect(user.saved_responses).toEqual([]);
    expect(user.subscription_type).toBe('standard');
    expect(user.subscription_status).toBe('inactive');
    expect(user.is_trial).toBe(false);
    expect(user.trial_end_date).toBeNull();
    expect(user.stripe_customer_id).toBeNull();
    expect(user.cancel_at_period_end).toBe(false);
    expect(user.created_at).toBeTruthy();
    // last_reset is stored in the code's PST-wall-as-UTC frame
    expect(user.last_reset).toBe('2026-09-23T22:00:00.000Z');
    expect(user.last_used).toBe('2026-09-23T22:00:00.000Z');
  });

  it('rethrows database errors', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    await expect(getUserData('a@b.com')).rejects.toMatchObject({ code: 'XX500' });
  });
});

describe('getIPUsage', () => {
  it('returns the existing ip_usage row', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 5, total_usage: 9 });
    const usage = await getIPUsage('1.2.3.4');
    expect(usage).toMatchObject({ ip_address: '1.2.3.4', daily_usage: 5, total_usage: 9 });
  });

  it('returns a zeroed default when the IP has no record (PGRST116 tolerated)', async () => {
    const usage = await getIPUsage('1.2.3.4');
    expect(usage).toEqual({ ip_address: '1.2.3.4', daily_usage: 0, total_usage: 0 });
  });

  it('rethrows non-PGRST116 errors', async () => {
    sb.state.errors.ip_usage = { code: 'XX500', message: 'boom' };
    await expect(getIPUsage('1.2.3.4')).rejects.toMatchObject({ code: 'XX500' });
  });
});

describe('updateIPUsage / createIPUsage', () => {
  it('updateIPUsage returns { data, error } without throwing on db errors', async () => {
    sb.state.errors.ip_usage = { code: 'XX500', message: 'boom' };
    const { data, error } = await updateIPUsage('1.2.3.4', { daily_usage: 2 });
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: 'XX500' });
  });

  it('updateIPUsage patches the matching row and returns it', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 1, total_usage: 1 });
    const { data, error } = await updateIPUsage('1.2.3.4', { daily_usage: 5 });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ ip_address: '1.2.3.4', daily_usage: 5, total_usage: 1 });
    expect(sb.state.tables.ip_usage[0].daily_usage).toBe(5);
  });

  it('createIPUsage inserts and rethrows on error', async () => {
    await createIPUsage({ ip_address: '5.6.7.8', daily_usage: 0, total_usage: 0 });
    expect(sb.state.tables.ip_usage).toHaveLength(1);

    sb.state.errors.ip_usage = { code: 'XX23505', message: 'duplicate key' };
    await expect(createIPUsage({ ip_address: '5.6.7.8' })).rejects.toMatchObject({ code: 'XX23505' });
  });
});

describe('findOrCreateUser', () => {
  it('adds anonymous swipes to an existing user daily and total usage', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 10,
      total_usage: 30,
      subscription_status: 'inactive',
    });

    const user = await findOrCreateUser('a@b.com', 'A', 'http://pic', 4);
    expect(user.daily_usage).toBe(14);
    expect(user.total_usage).toBe(34);
    expect(user.last_used).toBeTruthy();
    expect(sb.state.ops.find((o) => o.action === 'update')).toMatchObject({
      table: 'users',
      payload: { daily_usage: 14, total_usage: 34 },
    });
  });

  it('treats missing usage counters as zero when adding swipes', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', daily_usage: null, total_usage: null });
    const user = await findOrCreateUser('a@b.com', 'A', 'http://pic', 2);
    expect(user.daily_usage).toBe(2);
    expect(user.total_usage).toBe(2);
  });

  it('creates a new user carrying the anonymous swipes over', async () => {
    const user = await findOrCreateUser('new@b.com', 'New', 'http://pic', 6);
    expect(user).toMatchObject({
      email: 'new@b.com',
      name: 'New',
      picture: 'http://pic',
      daily_usage: 6,
      total_usage: 6,
    });
  });

  it('defaults anonymousSwipes to 0', async () => {
    const user = await findOrCreateUser('new2@b.com', 'N2', null);
    expect(user.daily_usage).toBe(0);
    expect(user.total_usage).toBe(0);
  });
});

describe('getDailyUsage', () => {
  it('returns total_usage for the email on today (UTC date key)', async () => {
    // Note: this function keys on the REAL UTC date, unlike the reset logic
    // which uses PST — part of the same date-mixing quirk family.
    const utcToday = new Date().toISOString().split('T')[0]; // 2026-09-24 under fake timers
    sb.state.tables.ip_usage.push({ user_email: 'a@b.com', date: utcToday, total_usage: 7 });

    expect(await getDailyUsage('a@b.com')).toBe(7);
  });

  it('KNOWN BUG (usage-atomicity fix PR): throws a TypeError when no record exists — data.total_usage on null. Current behavior asserted; fix should return 0.', async () => {
    await expect(getDailyUsage('nobody@example.com')).rejects.toThrow();
  });
});

describe('resetDailyUsage', () => {
  it('zeroes daily_usage, stamps last_reset, and archives yesterday count into history', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 5,
      daily_usage_history: {},
    });

    await resetDailyUsage(sb.client, 'a@b.com');

    const row = sb.state.tables.users[0];
    expect(row.daily_usage).toBe(0);
    expect(row.last_reset).toBe('2026-09-23T22:00:00.000Z'); // fake-frame "now"
    // yesterday in the code's frame is 2026-09-22 (PST date minus 1)
    expect(row.daily_usage_history).toEqual({ '2026-09-22': 5 });
  });

  it('does not add a history entry when daily_usage is 0', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 0,
      daily_usage_history: { '2026-09-20': 9 },
    });

    await resetDailyUsage(sb.client, 'a@b.com');
    // Existing history is preserved, nothing new added
    expect(sb.state.tables.users[0].daily_usage_history).toEqual({ '2026-09-20': 9 });
  });

  it('rethrows when the update fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', daily_usage: 5 });
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    await expect(resetDailyUsage(sb.client, 'a@b.com')).rejects.toMatchObject({ code: 'XX500' });
  });
});

describe('checkAndResetUsage (daily reset logic, PST/UTC mixing quirks)', () => {
  it('resets when last_reset is null', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', daily_usage: 9, last_reset: null });

    const wasReset = await checkAndResetUsage('a@b.com', true);
    expect(wasReset).toBe(true);
    expect(sb.state.tables.users[0].daily_usage).toBe(0);
  });

  it('resets when last_reset is from the previous PST day (encoded the way the code stores it)', async () => {
    // last swipe yesterday ~23:50 PST → stored last_reset encodes PST wall as UTC
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 12,
      last_reset: encodePSTWallAsISO('2026-09-22T23:50:00Z'), // "2026-09-22T23:50:00.000Z"
    });

    const wasReset = await checkAndResetUsage('a@b.com', true);
    expect(wasReset).toBe(true);
    expect(sb.state.tables.users[0].daily_usage).toBe(0);
    // history archived under the code-frame's yesterday (2026-09-22)
    expect(sb.state.tables.users[0].daily_usage_history).toEqual({ '2026-09-22': 12 });
  });

  it('does not reset when last_reset is later than this (code-frame) midnight — same PST day', async () => {
    // 00:30 PST today is AFTER the code-frame midnight of "today" (2026-09-23T00:00Z)
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 4,
      last_reset: encodePSTWallAsISO('2026-09-23T07:30:00Z'), // "2026-09-23T00:30:00.000Z"
    });

    const wasReset = await checkAndResetUsage('a@b.com', true);
    expect(wasReset).toBe(false);
    expect(sb.state.tables.users[0].daily_usage).toBe(4);
  });

  it('QUIRK: the reset boundary follows PST wall days, not UTC days — a swipe at 05:00Z on Sep 24 is still "Sep 23" to the reset logic', async () => {
    // The user's last_reset encodes 2026-09-24T03:00:00.000Z (PST wall 03:00
    // encoded as UTC) — i.e. 03:00 "today" in the code frame, which is after
    // the code-frame midnight, so NO reset happens even though real UTC has
    // already crossed into Sep 24.
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 2,
      last_reset: encodePSTWallAsISO('2026-09-24T10:00:00Z'), // PST 03:00 Sep 24
    });

    expect(await checkAndResetUsage('a@b.com', true)).toBe(false);
  });

  it('never resets IP identifiers — anonymous usage has no daily-reset path here', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 30, total_usage: 100 });

    const wasReset = await checkAndResetUsage('1.2.3.4', false);
    expect(wasReset).toBe(false);
    // ip_usage untouched — KNOWN GAP (usage-atomicity fix PR): anonymous daily
    // usage only resets because getIPUsage-based checks read rows keyed by
    // nothing date-specific; there is no cron/rollover for ip_usage rows.
    expect(sb.state.ops.filter((o) => o.action === 'update')).toHaveLength(0);
  });

  it('rethrows when the user lookup fails', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    await expect(checkAndResetUsage('a@b.com', true)).rejects.toMatchObject({ code: 'XX500' });
  });
});

describe('checkUsageLimits', () => {
  it('premium (subscription_status active) → canSwipe true, unlimited', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 9999,
      subscription_status: 'active',
      is_trial: false,
      trial_end_date: null,
    });

    const result = await checkUsageLimits('a@b.com', true);
    expect(result).toMatchObject({ canSwipe: true, isPremium: true, isTrial: false, dailySwipes: 9999 });
    expect(result.requiresUpgrade).toBeUndefined();
  });

  it('active trial → canSwipe true with trialEndsAt', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 2,
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
    });

    const result = await checkUsageLimits('a@b.com', true);
    expect(result).toMatchObject({
      canSwipe: true,
      isPremium: false,
      isTrial: true,
      dailySwipes: 2,
      trialEndsAt: '2099-01-01T00:00:00.000Z',
    });
  });

  it('expired trial falls through to the free-tier path', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 5,
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2020-01-01T00:00:00.000Z',
    });

    const result = await checkUsageLimits('a@b.com', true);
    expect(result).toMatchObject({ canSwipe: true, isPremium: false, isTrial: false, requiresUpgrade: false });
  });

  it('free user under the limit → canSwipe true, requiresUpgrade false', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 13,
      subscription_status: 'inactive',
      is_trial: false,
      trial_end_date: null,
    });

    const result = await checkUsageLimits('a@b.com', true);
    expect(result).toMatchObject({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 13, requiresUpgrade: false });
  });

  it('free user at FREE_USER_DAILY_LIMIT (14) → canSwipe false, requiresUpgrade true', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 14,
      subscription_status: 'inactive',
      is_trial: false,
      trial_end_date: null,
    });

    const result = await checkUsageLimits('a@b.com', true);
    expect(result).toMatchObject({ canSwipe: false, dailySwipes: 14, requiresUpgrade: true });
  });

  it('returns { error: "User not found" } for unknown email', async () => {
    const result = await checkUsageLimits('ghost@example.com', true);
    expect(result).toEqual({ error: 'User not found' });
  });

  it('anonymous IP with no record → canSwipe true (no requiresSignIn)', async () => {
    const result = await checkUsageLimits('1.2.3.4', false);
    expect(result).toMatchObject({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 0 });
    expect(result.requiresSignIn).toBe(false);
  });

  it('anonymous IP under the limit → canSwipe true', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 13 });
    const result = await checkUsageLimits('1.2.3.4', false);
    expect(result).toMatchObject({ canSwipe: true, dailySwipes: 13, requiresSignIn: false });
  });

  it('anonymous IP at ANONYMOUS_USAGE_LIMIT (14) → canSwipe false, requiresSignIn true', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 14 });
    const result = await checkUsageLimits('1.2.3.4', false);
    expect(result).toMatchObject({ canSwipe: false, dailySwipes: 14, requiresSignIn: true });
  });
});

describe('incrementUsage', () => {
  it('email path: increments daily and total usage and stamps the daily history', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 3,
      total_usage: 20,
      daily_usage_history: {},
      subscription_status: 'inactive',
      is_trial: false,
      last_reset: encodePSTWallAsISO('2026-09-23T07:30:00Z'), // today in code frame → no reset
    });

    const result = await incrementUsage('a@b.com', true);
    expect(result.dailySwipes).toBe(4);
    expect(sb.state.tables.users[0].daily_usage).toBe(4);
    expect(sb.state.tables.users[0].total_usage).toBe(21);
    // history keyed by the code-frame "today" (2026-09-23)
    expect(sb.state.tables.users[0].daily_usage_history).toEqual({ '2026-09-23': 1 });
  });

  it('email path: initializes daily_usage_history when missing', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 0,
      total_usage: 0,
      last_reset: encodePSTWallAsISO('2026-09-23T07:30:00Z'),
    });

    await incrementUsage('a@b.com', true);
    expect(sb.state.tables.users[0].daily_usage_history).toEqual({ '2026-09-23': 1 });
  });

  it('email path: at the limit → returns the limit check WITHOUT writing (enforcement)', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 14,
      total_usage: 40,
      subscription_status: 'inactive',
      is_trial: false,
      last_reset: encodePSTWallAsISO('2026-09-23T07:30:00Z'),
    });

    const result = await incrementUsage('a@b.com', true);
    expect(result.canSwipe).toBe(false);
    expect(result.requiresUpgrade).toBe(true);
    expect(sb.state.tables.users[0].daily_usage).toBe(14);
    expect(sb.state.ops.filter((o) => o.action === 'update' || o.action === 'insert' || o.action === 'upsert'))
      .toHaveLength(0);
  });

  it('email path: resets stale usage first, then increments (daily-reset + increment integration)', async () => {
    // last swipe yesterday PST → increment must reset to 0 first, then count 1
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      daily_usage: 14,
      total_usage: 40,
      last_reset: encodePSTWallAsISO('2026-09-22T23:50:00Z'),
    });

    const result = await incrementUsage('a@b.com', true);
    expect(result.dailySwipes).toBe(1);
    expect(sb.state.tables.users[0].daily_usage).toBe(1);
    expect(sb.state.tables.users[0].daily_usage_history).toEqual({ '2026-09-22': 14, '2026-09-23': 1 });
  });

  it('IP path: creates the ip_usage record via upsert when missing (PGRST116 tolerated)', async () => {
    const result = await incrementUsage('1.2.3.4', false);
    expect(result.dailySwipes).toBe(1);
    expect(sb.state.tables.ip_usage[0]).toMatchObject({
      ip_address: '1.2.3.4',
      daily_usage: 1,
      total_usage: 1,
      // last_reset is stamped with the code-frame date (PST), not UTC
      last_reset: '2026-09-23',
    });
  });

  it('IP path: increments an existing record', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 2, total_usage: 2 });
    const result = await incrementUsage('1.2.3.4', false);
    expect(result.dailySwipes).toBe(3);
    expect(sb.state.tables.ip_usage[0]).toMatchObject({ daily_usage: 3, total_usage: 3 });
  });

  it('IP path: at the anonymous limit → no write, returns the limit check', async () => {
    sb.state.tables.ip_usage.push({ ip_address: '1.2.3.4', daily_usage: 14, total_usage: 20 });
    const result = await incrementUsage('1.2.3.4', false);
    expect(result.canSwipe).toBe(false);
    expect(result.requiresSignIn).toBe(true);
    expect(sb.state.tables.ip_usage[0].daily_usage).toBe(14);
    expect(sb.state.ops.filter((o) => o.action === 'update' || o.action === 'upsert')).toHaveLength(0);
  });
});
