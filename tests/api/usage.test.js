/**
 * Route tests for src/app/api/usage/route.js
 *
 * Mocks the two util modules the route delegates to and pins the merge of
 * { ...usageStatus, wasReset }.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/usage/route';
import { checkAndResetUsage } from '@/utils/dbOperations';
import { checkUsageStatus } from '@/utils/usageTracking';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('@/utils/dbOperations', () => ({
  checkAndResetUsage: vi.fn(),
  checkUsageLimits: vi.fn(),
}));

vi.mock('@/utils/usageTracking', () => ({
  checkUsageStatus: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  checkAndResetUsage.mockResolvedValue(false);
  checkUsageStatus.mockResolvedValue({ isPremium: false, isTrial: false, limitReached: false, dailySwipes: 0 });
});

describe('GET /api/usage', () => {
  it('returns the usage status with wasReset false for a signed-in user', async () => {
    checkUsageStatus.mockResolvedValue({ isPremium: true, isTrial: false, limitReached: false, dailySwipes: 12 });

    const res = await GET(makeRequest(`${BASE}/api/usage`, {
      headers: { 'x-user-email': 'a@b.com', 'x-user-name': 'Alice', 'x-user-picture': 'http://pic' },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPremium: true, isTrial: false, limitReached: false, dailySwipes: 12, wasReset: false });
    expect(checkAndResetUsage).toHaveBeenCalledWith('a@b.com', true);
    expect(checkUsageStatus).toHaveBeenCalledWith('a@b.com', true, 'Alice', 'http://pic');
  });

  it('reports wasReset true after a daily rollover', async () => {
    checkAndResetUsage.mockResolvedValue(true);

    const res = await GET(makeRequest(`${BASE}/api/usage`, { headers: { 'x-user-email': 'a@b.com' } }));

    expect(res.status).toBe(200);
    expect((await res.json()).wasReset).toBe(true);
  });

  it('uses the IP identifier for anonymous users', async () => {
    checkUsageStatus.mockResolvedValue({ isPremium: false, isTrial: false, limitReached: false, dailySwipes: 4 });

    const res = await GET(makeRequest(`${BASE}/api/usage`, { headers: { 'x-forwarded-for': '1.2.3.4' } }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dailySwipes).toBe(4);
    expect(body.wasReset).toBe(false);
    expect(checkAndResetUsage).toHaveBeenCalledWith('1.2.3.4', false);
    expect(checkUsageStatus).toHaveBeenCalledWith('1.2.3.4', false, null, null);
  });

  it('returns 500 with the error message when the status check throws', async () => {
    checkUsageStatus.mockRejectedValue(new Error('boom'));

    const res = await GET(makeRequest(`${BASE}/api/usage`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
