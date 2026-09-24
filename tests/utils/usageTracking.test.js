/**
 * Unit tests for src/utils/usageTracking.js
 *
 * Two mock layers:
 *  - '@supabase/supabase-js' (client-creation) for getLearningPercentage,
 *    which uses the module's own cached client.
 *  - '@/utils/dbOperations' for checkUsageStatus's delegates
 *    (findOrCreateUser / getIPUsage). The alias resolves to the same module
 *    usageTracking imports via './dbOperations'.
 *
 * Time handling: TZ is pinned to UTC (vitest.config + setup.js). The module
 * computes "next reset" from PST wall-clock time (toLocaleString with
 * timeZone: 'America/Los_Angeles') re-parsed in the MACHINE timezone — on a
 * UTC machine that yields the PST wall time encoded as UTC, i.e. roughly 7-8
 * hours behind the real instant. Several tests below pin exactly that quirk.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkUsageStatus,
  RESET_TIMEZONE,
  getNextResetTime,
  getFormattedTimeUntilReset,
  getLearningPercentage,
} from '@/utils/usageTracking';
import { getSupabaseMock } from '../helpers/supabase-mock.js';
import { findOrCreateUser, getIPUsage } from '@/utils/dbOperations';

vi.mock('@supabase/supabase-js', async () => {
  const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
  return createSupabaseMockModule();
});

vi.mock('@/utils/dbOperations', () => ({
  getUserData: vi.fn(),
  getIPUsage: vi.fn(),
  findOrCreateUser: vi.fn(),
}));

// Handles to the mocked fns — the import above resolves to the mock.
const findOrCreateUserMock = findOrCreateUser;
const getIPUsageMock = getIPUsage;

const sb = getSupabaseMock();

beforeEach(() => {
  sb.reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Real UTC 2026-09-24T05:00Z → PST wall Sep 23 22:00 → code frame "now" is
  // 2026-09-23T22:00:00.000Z (PST wall encoded as UTC).
  vi.setSystemTime(new Date('2026-09-24T05:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('constants', () => {
  it('exports the reset timezone used by the daily-reset logic', () => {
    expect(RESET_TIMEZONE).toBe('America/Los_Angeles');
  });
});

describe('checkUsageStatus — email (signed-in) paths', () => {
  it('premium user: isPremium true, no limit', async () => {
    findOrCreateUserMock.mockResolvedValue({
      email: 'a@b.com',
      subscription_status: 'active',
      is_trial: false,
      trial_end_date: null,
      daily_usage: 500,
    });

    const status = await checkUsageStatus('a@b.com', true, 'Alice', 'http://pic');
    expect(status).toEqual({
      isPremium: true,
      isTrial: false,
      limitReached: false,
      dailySwipes: 500,
    });
    expect(status.trialEndsAt).toBeUndefined();
    expect(findOrCreateUserMock).toHaveBeenCalledWith('a@b.com', 'Alice', 'http://pic');
  });

  it('active trial: isTrial true with trialEndsAt, isPremium false', async () => {
    findOrCreateUserMock.mockResolvedValue({
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
      daily_usage: 3,
    });

    const status = await checkUsageStatus('a@b.com', true);
    expect(status).toEqual({
      isPremium: false,
      isTrial: true,
      limitReached: false,
      dailySwipes: 3,
      trialEndsAt: '2099-01-01T00:00:00.000Z',
    });
  });

  it('expired trial: isTrial false, no trialEndsAt', async () => {
    findOrCreateUserMock.mockResolvedValue({
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2020-01-01T00:00:00.000Z',
      daily_usage: 9,
    });

    const status = await checkUsageStatus('a@b.com', true);
    expect(status).toEqual({
      isPremium: false,
      isTrial: false,
      limitReached: false,
      dailySwipes: 9,
    });
  });

  it('KNOWN BUG (usage-enforcement fix PR): limitReached is ALWAYS false — even a free user far past the daily limit reports limitReached: false. This makes the /api/openai "limit reached → 403" branch unreachable through the real util. Current behavior asserted.', async () => {
    findOrCreateUserMock.mockResolvedValue({
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: false,
      daily_usage: 99999,
    });

    const status = await checkUsageStatus('a@b.com', true);
    expect(status.limitReached).toBe(false);
  });

  it('rejects an email identifier that does not contain @', async () => {
    await expect(checkUsageStatus('not-an-email', true)).rejects.toThrow('Invalid email format');
  });

  it('rejects an IP identifier that contains @', async () => {
    await expect(checkUsageStatus('evil@1.2.3.4', false)).rejects.toThrow('Invalid IP address format');
  });
});

describe('checkUsageStatus — anonymous (IP) paths', () => {
  it('reports the IP daily usage with no premium/trial flags', async () => {
    getIPUsageMock.mockResolvedValue({ ip_address: '1.2.3.4', daily_usage: 7, total_usage: 20 });

    const status = await checkUsageStatus('1.2.3.4', false);
    expect(status).toEqual({
      isPremium: false,
      isTrial: false,
      limitReached: false,
      dailySwipes: 7,
    });
    expect(getIPUsageMock).toHaveBeenCalledWith('1.2.3.4');
  });

  it('KNOWN BUG (usage-enforcement fix PR): limitReached is ALWAYS false for anonymous users too — the 14/anonymous cap is enforced downstream (swipes route / checkUsageLimits), not here. Current behavior asserted.', async () => {
    getIPUsageMock.mockResolvedValue({ ip_address: '1.2.3.4', daily_usage: 14, total_usage: 14 });
    const status = await checkUsageStatus('1.2.3.4', false);
    expect(status.limitReached).toBe(false);
  });
});

describe('getNextResetTime (PST/UTC mixing quirks)', () => {
  // Mirror of the production algorithm — TZ-hermetic structural pin.
  const mirrorNextReset = (now) => {
    const pstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const tomorrow = new Date(pstDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  };

  it('returns midnight of the next PST day in the code frame', () => {
    const now = new Date();
    expect(getNextResetTime()).toEqual(mirrorNextReset(now));
  });

  it('QUIRK (UTC machine): the returned instant is the PST-wall midnight encoded as UTC — 7h EARLIER than the true next PST midnight', () => {
    // Real now = 05:00Z Sep 24 → PST wall = 22:00 Sep 23 → code-frame next
    // reset = 2026-09-24T00:00:00.000Z, which is in the PAST relative to real
    // now. (On a PST machine the same code returns the correct real instant,
    // 07:00Z.) Current behavior asserted; date-handling fix PR will correct.
    const next = getNextResetTime();
    expect(next.toISOString()).toBe('2026-09-24T00:00:00.000Z');
    expect(next.getTime()).toBeLessThan(new Date('2026-09-24T05:00:00Z').getTime());
  });
});

describe('getFormattedTimeUntilReset (PST/UTC mixing quirks)', () => {
  it('formats as "Xh Ym"', () => {
    expect(getFormattedTimeUntilReset()).toMatch(/^-?\d+h -?\d+m$/);
  });

  it('QUIRK (UTC machine): computes against the skewed code frame — NEGATIVE time remaining', () => {
    // nextReset (code frame) = 2026-09-24T00:00:00.000Z; real now = 05:00Z →
    // diff = -5h → "-5h 0m". A correct implementation would say ~2h (real
    // next PST midnight is 07:00Z). Current behavior asserted.
    expect(getFormattedTimeUntilReset()).toBe('-5h 0m');
  });
});

describe('getLearningPercentage (percentage math from src/app/constants.js)', () => {
  it('returns the minimum percentage (0) when no email is given', async () => {
    expect(await getLearningPercentage(null)).toEqual({ percentage: 0 });
    expect(await getLearningPercentage('')).toEqual({ percentage: 0 });
  });

  it('returns the minimum percentage on database errors', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    expect(await getLearningPercentage('a@b.com')).toEqual({ percentage: 0 });
  });

  it('FREE user: 5% per saved response', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: false,
      saved_responses: [{}, {}, {}],
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.percentage).toBe(15);
    expect(result.savedResponsesCount).toBe(3);
    expect(result.debug).toEqual({ increment: 5, max: 70, calculated: 15, final: 15 });
  });

  it('FREE user: caps at FREE_MAX_PERCENTAGE (70%) — 14 responses hit the cap exactly', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: false,
      saved_responses: Array.from({ length: 14 }, () => ({})),
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.debug.calculated).toBe(70);
    expect(result.percentage).toBe(70);
  });

  it('FREE user: 20 responses would calculate 100% but is capped at 70%', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: false,
      saved_responses: Array.from({ length: 20 }, () => ({})),
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.debug.calculated).toBe(100);
    expect(result.debug.final).toBe(70);
    expect(result.percentage).toBe(70);
  });

  it('PREMIUM user: 7% per saved response', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'active',
      is_trial: false,
      saved_responses: [{}, {}, {}],
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.percentage).toBe(21);
    expect(result.debug).toEqual({ increment: 7, max: 100, calculated: 21, final: 21 });
  });

  it('PREMIUM user: caps at PREMIUM_MAX_PERCENTAGE (100%)', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'active',
      is_trial: false,
      saved_responses: Array.from({ length: 15 }, () => ({})),
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.debug.calculated).toBe(105);
    expect(result.percentage).toBe(100);
  });

  it('ACTIVE TRIAL users get the premium increments (7%/100%)', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
      saved_responses: [{}, {}, {}],
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.percentage).toBe(21);
    expect(result.debug.increment).toBe(7);
  });

  it('EXPIRED trial users get the free increments (5%/70%)', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2020-01-01T00:00:00.000Z',
      saved_responses: [{}, {}, {}],
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.percentage).toBe(15);
    expect(result.debug.increment).toBe(5);
  });

  it('user with no saved_responses → 0%', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: false,
      saved_responses: null,
    });

    const result = await getLearningPercentage('a@b.com');
    expect(result.percentage).toBe(0);
    expect(result.savedResponsesCount).toBe(0);
  });
});
