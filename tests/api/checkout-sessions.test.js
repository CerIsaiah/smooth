/**
 * Route tests for src/app/api/checkout_sessions/route.js
 *
 * Module-scope Stripe and Supabase clients are mocked before import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, OPTIONS } from '@/app/api/checkout_sessions/route';
import { getStripeMock } from '../helpers/external-clients-mock.js';
import { getSupabaseMock } from '../helpers/supabase-mock.js';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('stripe', async () => {
  const { createStripeMockModule } = await import('../helpers/external-clients-mock.js');
  return createStripeMockModule();
});

vi.mock('@supabase/supabase-js', async () => {
  const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
  return createSupabaseMockModule();
});

const stripe = getStripeMock();
const sb = getSupabaseMock();

beforeEach(() => {
  vi.clearAllMocks();
  sb.reset();
  stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/pay/cs_test' });
});

describe('POST /api/checkout_sessions', () => {
  it('returns 401 when neither userId nor userEmail is provided', async () => {
    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, { method: 'POST', body: {} }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Please sign in to continue with checkout');
  });

  it('looks the user up by userId when given', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', trial_started_at: null });

    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
      method: 'POST',
      body: { userId: 'u1' },
    }));

    expect(res.status).toBe(200);
    const op = sb.state.ops[0];
    expect(op.filters).toEqual([{ id: 'u1' }]);
  });

  it('creates a subscription checkout session with a 3-day trial for a new customer', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', trial_started_at: null });

    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
      method: 'POST',
      body: { userEmail: ' A@B.com ' }, // route lowercases + trims
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test' });

    expect(sb.state.ops[0].filters).toEqual([{ email: 'a@b.com' }]);
    const sessionArgs = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(sessionArgs.mode).toBe('subscription');
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(499); // $5.00
    expect(sessionArgs.line_items[0].price_data.recurring).toEqual({ interval: 'month' });
    expect(sessionArgs.subscription_data.trial_period_days).toBe(3);
    expect(sessionArgs.customer_email).toBe('a@b.com');
    expect(sessionArgs.metadata).toEqual({ user_id: 'u1', user_email: 'a@b.com' });
    expect(sessionArgs.success_url).toContain('/?success=true');
    expect(sessionArgs.cancel_url).toContain('/?canceled=true');
  });

  it('returns 404 when the user does not exist', async () => {
    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
      method: 'POST',
      body: { userEmail: 'ghost@b.com' },
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('User not found');
  });

  it('returns 400 when the trial has already been used', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', trial_started_at: '2026-01-01T00:00:00.000Z' });

    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Trial period has already been used');
  });

  it('returns 500 when Stripe is not configured (missing secret key)', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    try {
      const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
        method: 'POST',
        body: { userEmail: 'a@b.com' },
      }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Stripe is not properly configured');
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns 500 when the Stripe session creation fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com' });
    stripe.checkout.sessions.create.mockRejectedValue(new Error('card declined'));

    const res = await POST(makeRequest(`${BASE}/api/checkout_sessions`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Error creating checkout session. Please try again.');
  });
});

describe('OPTIONS /api/checkout_sessions', () => {
  it('responds 200 with CORS headers', async () => {
    const res = await OPTIONS(makeRequest(`${BASE}/api/checkout_sessions`, { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-headers')).toContain('X-User-Email');
  });
});
