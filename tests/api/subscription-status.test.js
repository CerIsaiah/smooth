/**
 * Route tests for src/app/api/subscription-status/route.js
 *
 * Module-scope Supabase client mocked before import. Pins the status
 * derivation (free / trial / trial-canceling / premium / canceling),
 * including the downgrade gap for canceled-but-never-downgraded users.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/subscription-status/route';
import { getSupabaseMock } from '../helpers/supabase-mock.js';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('@supabase/supabase-js', async () => {
  const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
  return createSupabaseMockModule();
});

const sb = getSupabaseMock();

beforeEach(() => {
  vi.clearAllMocks();
  sb.reset();
});

describe('GET /api/subscription-status', () => {
  it('returns 400 when neither userId nor userEmail is given', async () => {
    const res = await GET(makeRequest(`${BASE}/api/subscription-status`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('User ID or email is required');
  });

  it('normalizes the email param (lowercase + trim) in the query', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', subscription_type: 'standard' });

    await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=%20A@B.com%20`));

    expect(sb.state.ops[0].filters).toEqual([{ email: 'a@b.com' }]);
  });

  it('queries by userId when provided', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com' });

    await GET(makeRequest(`${BASE}/api/subscription-status?userId=u1`));
    expect(sb.state.ops[0].filters).toEqual([{ id: 'u1' }]);
  });

  it('returns 500 when the lookup fails', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    const res = await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to fetch subscription status');
  });

  it('free user (default)', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_type: 'standard',
      subscription_status: 'inactive',
      is_trial: false,
      trial_end_date: null,
    });

    const res = await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('free');
    expect(body.details).toMatchObject({
      type: 'standard',
      isTrialActive: false,
      isCanceled: false,
      hadTrial: false,
      canceledDuringTrial: false,
    });
  });

  it('active trial → status "trial" with trialEndsAt', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_type: 'premium',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
      trial_started_at: '2026-09-01T00:00:00.000Z',
    });

    const body = await (await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`))).json();
    expect(body.status).toBe('trial');
    expect(body.details.isTrialActive).toBe(true);
    expect(body.details.trialEndsAt).toBe('2099-01-01T00:00:00.000Z');
    expect(body.details.hadTrial).toBe(true);
  });

  it('active trial with cancel_at_period_end → "trial-canceling"', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'inactive',
      is_trial: true,
      trial_end_date: '2099-01-01T00:00:00.000Z',
      cancel_at_period_end: true,
    });

    const body = await (await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`))).json();
    expect(body.status).toBe('trial-canceling');
    expect(body.details.canceledDuringTrial).toBe(true);
  });

  it('active subscription → "premium" with subscriptionEndsAt', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'active',
      is_trial: false,
      subscription_end_date: '2099-06-01T00:00:00.000Z',
    });

    const body = await (await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`))).json();
    expect(body.status).toBe('premium');
    expect(body.details.subscriptionEndsAt).toBe('2099-06-01T00:00:00.000Z');
  });

  it('KNOWN BUG (Stripe subscription-lifecycle PR #1): an active subscription with a PAST subscription_end_date still reports "premium" — nothing downgrades the row when the period ends. Current behavior asserted.', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'active',
      is_trial: false,
      subscription_end_date: '2020-01-01T00:00:00.000Z', // long past
    });

    const body = await (await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`))).json();
    expect(body.status).toBe('premium');
  });

  it('subscription_status "canceling" → "canceling"', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      subscription_status: 'canceling',
      subscription_end_date: '2099-06-01T00:00:00.000Z',
    });

    const body = await (await GET(makeRequest(`${BASE}/api/subscription-status?userEmail=a@b.com`))).json();
    expect(body.status).toBe('canceling');
    expect(body.details.isCanceled).toBe(false);
  });
});
