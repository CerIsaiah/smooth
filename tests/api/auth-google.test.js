/**
 * Route tests for src/app/api/auth/google/route.js
 *
 * The route instantiates its OAuth2Client at module scope — 'google-auth-library'
 * is mocked before import. dbOperations (getIPUsage, findOrCreateUser) is also
 * mocked; the tests pin the identity handoff and the client-facing fields.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/auth/google/route';
import { getIPUsage, findOrCreateUser } from '@/utils/dbOperations';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('google-auth-library', async () => {
  const { createGoogleAuthMockModule } = await import('../helpers/external-clients-mock.js');
  return createGoogleAuthMockModule();
});

vi.mock('@/utils/dbOperations', () => ({
  getIPUsage: vi.fn(),
  findOrCreateUser: vi.fn(),
  checkUsageLimits: vi.fn(),
}));

const { getGoogleAuthMock } = await import('../helpers/external-clients-mock.js');
const googleAuth = getGoogleAuthMock();

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm the default resolution (a test overriding verifyIdToken with
  // mockRejectedValue would otherwise leak into later tests).
  googleAuth.verifyIdToken.mockImplementation(() =>
    Promise.resolve({ getPayload: googleAuth.getPayload })
  );
  googleAuth.getPayload.mockReturnValue({
    email: 'a@b.com',
    name: 'Alice',
    picture: 'http://pic/alice.png',
  });
  getIPUsage.mockResolvedValue({ daily_usage: 7, total_usage: 9 });
  findOrCreateUser.mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    name: 'Alice',
    picture: 'http://pic/alice.png',
    daily_usage: 7,
    total_usage: 9,
    subscription_status: 'active',
    is_trial: false,
  });
});

describe('POST /api/auth/google', () => {
  it('verifies the credential and returns the user with usage fields', async () => {
    const res = await POST(makeRequest(`${BASE}/api/auth/google`, {
      method: 'POST',
      body: { credential: 'tok' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      avatar_url: 'http://pic/alice.png', // route remaps picture → avatar_url
    });
    expect(body.dailySwipes).toBe(7);
    expect(body.totalSwipes).toBe(9);
    expect(body.isPremium).toBe(true); // subscription_status 'active'
    expect(body.isTrial).toBe(false);

    expect(googleAuth.verifyIdToken).toHaveBeenCalledWith({ idToken: 'tok', audience: 'placeholder-client-id' });
    expect(getIPUsage).toHaveBeenCalledWith('unknown'); // no IP headers → fallback
    expect(findOrCreateUser).toHaveBeenCalledWith('a@b.com', 'Alice', 'http://pic/alice.png', 7);
  });

  it('uses the first IP from x-forwarded-for only (no x-real-ip fallback)', async () => {
    await POST(makeRequest(`${BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1', 'x-real-ip': '5.6.7.8' },
      body: { credential: 'tok' },
    }));

    expect(getIPUsage).toHaveBeenCalledTimes(1);
    expect(getIPUsage).toHaveBeenCalledWith('1.2.3.4');
  });

  it('returns trial fields for a trial user', async () => {
    findOrCreateUser.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
    });

    const res = await POST(makeRequest(`${BASE}/api/auth/google`, {
      method: 'POST',
      body: { credential: 'tok' },
    }));

    const body = await res.json();
    expect(body.isPremium).toBe(false);
    expect(body.isTrial).toBe(true);
    expect(body.trialEndsAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('returns 401 when the token verification fails', async () => {
    googleAuth.verifyIdToken.mockRejectedValue(new Error('invalid token'));

    const res = await POST(makeRequest(`${BASE}/api/auth/google`, {
      method: 'POST',
      body: { credential: 'bad' },
    }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Authentication failed: invalid token');
  });

  it('returns 401 when findOrCreateUser fails', async () => {
    findOrCreateUser.mockRejectedValue(new Error('db down'));

    const res = await POST(makeRequest(`${BASE}/api/auth/google`, {
      method: 'POST',
      body: { credential: 'tok' },
    }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Authentication failed: db down');
  });
});
