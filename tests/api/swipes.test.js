/**
 * Route tests for src/app/api/swipes/route.js
 *
 * The route's collaborators (checkUsageLimits / incrementUsage from
 * dbOperations, checkUsageStatus / getNextResetTime from usageTracking) are
 * mocked, so the tests pin the route's own logic: tier checks, the
 * canSwipe decision, and the requiresSignIn / requiresUpgrade flags.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from '@/app/api/swipes/route';
import { checkUsageLimits, incrementUsage } from '@/utils/dbOperations';
import { checkUsageStatus } from '@/utils/usageTracking';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('@/utils/dbOperations', () => ({
  checkUsageLimits: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock('@/utils/usageTracking', () => ({
  checkUsageStatus: vi.fn(),
  getNextResetTime: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  checkUsageStatus.mockResolvedValue({ limitReached: false, dailySwipes: 0, isPremium: false, isTrial: false });
  incrementUsage.mockImplementation(async (id, isEmail) => ({
    canSwipe: true,
    isPremium: false,
    isTrial: false,
    dailySwipes: 1,
  }));
});

describe('GET /api/swipes', () => {
  it('returns the limit check for the requesting IP', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 3 });

    const res = await GET(makeRequest(`${BASE}/api/swipes`, { headers: { 'x-forwarded-for': '1.2.3.4' } }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 3 });
    expect(checkUsageLimits).toHaveBeenCalledWith('1.2.3.4', false);
  });

  it('passes the email identifier for signed-in users', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: true, dailySwipes: 1 });

    await GET(makeRequest(`${BASE}/api/swipes`, { headers: { 'x-user-email': 'a@b.com' } }));

    expect(checkUsageLimits).toHaveBeenCalledWith('a@b.com', true);
  });

  it('returns 500 with the error message when the check fails', async () => {
    checkUsageLimits.mockRejectedValue(new Error('db down'));

    const res = await GET(makeRequest(`${BASE}/api/swipes`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });
});

describe('POST /api/swipes — anonymous (IP) tier', () => {
  it('under the limit: increments usage and returns canSwipe true with no flags', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 5 });
    incrementUsage.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 6 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      canSwipe: true,
      isPremium: false,
      isTrial: false,
      dailySwipes: 6,
      requiresSignIn: false,
      requiresUpgrade: false,
    });
    expect(checkUsageStatus).toHaveBeenCalledWith('1.2.3.4', false);
    expect(incrementUsage).toHaveBeenCalledWith('1.2.3.4', false);
  });

  it('at ANONYMOUS_USAGE_LIMIT: no increment, canSwipe false, requiresSignIn true (enforcement path)', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: false, isPremium: false, isTrial: false, dailySwipes: 14 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canSwipe).toBe(false);
    expect(body.requiresSignIn).toBe(true);
    expect(incrementUsage).not.toHaveBeenCalled();
    expect(checkUsageStatus).not.toHaveBeenCalled();
  });
});

describe('POST /api/swipes — signed-in tiers', () => {
  it('free user under the limit: increments and returns canSwipe true', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 3 });
    incrementUsage.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 4 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com' },
    }));

    const body = await res.json();
    expect(body.canSwipe).toBe(true);
    expect(body.dailySwipes).toBe(4);
    expect(body.requiresUpgrade).toBe(false);
    expect(body.requiresSignIn).toBe(false);
    expect(incrementUsage).toHaveBeenCalledWith('a@b.com', true);
  });

  it('free user at FREE_USER_DAILY_LIMIT: no increment, canSwipe false, requiresUpgrade true (enforcement path)', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: false, isPremium: false, isTrial: false, dailySwipes: 14 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com' },
    }));

    const body = await res.json();
    expect(body.canSwipe).toBe(false);
    expect(body.requiresUpgrade).toBe(true);
    expect(body.requiresSignIn).toBe(false);
    expect(incrementUsage).not.toHaveBeenCalled();
  });

  it('premium user: canSwipe true (isPremium bypasses the daily limit) and increments', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: true, isTrial: false, dailySwipes: 500 });
    incrementUsage.mockResolvedValue({ canSwipe: true, isPremium: true, isTrial: false, dailySwipes: 501 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'premium@b.com' },
    }));

    const body = await res.json();
    expect(body.canSwipe).toBe(true);
    expect(body.dailySwipes).toBe(501);
    expect(body.requiresUpgrade).toBe(false);
    expect(incrementUsage).toHaveBeenCalled();
  });

  it('active trial user: canSwipe true', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: true, dailySwipes: 2 });
    incrementUsage.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: true, dailySwipes: 3 });

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'trial@b.com' },
    }));

    const body = await res.json();
    expect(body.canSwipe).toBe(true);
    expect(body.isTrial).toBe(true);
    expect(body.requiresUpgrade).toBe(false);
  });

  it('swallow-recovery: an increment failure still returns 200 with the pre-increment usage', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 5 });
    incrementUsage.mockRejectedValue(new Error('write failed'));

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canSwipe).toBe(true);
    expect(body.dailySwipes).toBe(5); // fell back to currentUsage
  });
});

describe('POST /api/swipes — edge cases', () => {
  it('tolerates an invalid JSON body and proceeds as anonymous', async () => {
    checkUsageLimits.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 1 });
    incrementUsage.mockResolvedValue({ canSwipe: true, isPremium: false, isTrial: false, dailySwipes: 2 });

    const req = new (await import('next/server')).NextRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4', 'content-type': 'application/json' },
      body: 'not json',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(checkUsageLimits).toHaveBeenCalledWith('1.2.3.4', false);
  });

  it('returns 500 with canSwipe false and requiresSignIn for anonymous users when the check throws', async () => {
    checkUsageLimits.mockRejectedValue(new Error('db down'));

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('db down');
    expect(body.canSwipe).toBe(false);
    expect(body.dailySwipes).toBe(0);
    expect(body.requiresSignIn).toBe(true);
    expect(body.requiresUpgrade).toBe(false);
  });

  it('returns 500 with requiresUpgrade true for signed-in users when the check throws', async () => {
    checkUsageLimits.mockRejectedValue(new Error('db down'));

    const res = await POST(makeRequest(`${BASE}/api/swipes`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com' },
    }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.canSwipe).toBe(false);
    expect(body.requiresUpgrade).toBe(true);
    expect(body.requiresSignIn).toBe(false);
  });
});
