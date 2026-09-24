/**
 * Route tests for src/app/api/learning-percentage/route.js — a thin GET
 * wrapper over getLearningPercentage. The util is mocked; the tests pin the
 * pass-through, the header handling, and the error mapping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/learning-percentage/route';
import { getLearningPercentage } from '@/utils/usageTracking';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('@/utils/usageTracking', () => ({
  getLearningPercentage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getLearningPercentage.mockResolvedValue({ percentage: 42, savedResponsesCount: 6 });
});

describe('GET /api/learning-percentage', () => {
  it('returns the util result and passes the x-user-email header through', async () => {
    const res = await GET(makeRequest(`${BASE}/api/learning-percentage`, {
      headers: { 'x-user-email': 'a@b.com' },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ percentage: 42, savedResponsesCount: 6 });
    expect(getLearningPercentage).toHaveBeenCalledWith('a@b.com');
  });

  it('passes null when no email header is present (util decides the fallback)', async () => {
    getLearningPercentage.mockResolvedValue({ percentage: 0 });

    const res = await GET(makeRequest(`${BASE}/api/learning-percentage`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ percentage: 0 });
    expect(getLearningPercentage).toHaveBeenCalledWith(null);
  });

  it('returns 500 "Internal server error" when the util throws', async () => {
    getLearningPercentage.mockRejectedValue(new Error('boom'));

    const res = await GET(makeRequest(`${BASE}/api/learning-percentage`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});
