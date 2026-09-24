/**
 * Route tests for src/app/api/cancel-subscription/route.js
 *
 * Module-scope Stripe and Supabase clients are mocked before import.
 * The route cancels at period end and deliberately keeps the user's
 * subscription_status as 'active' — asserting that current behavior (the
 * downgrade gap) below.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/cancel-subscription/route';
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

const PERIOD_END_SECONDS = 1790000000;
const canceledSubscription = {
  id: 'sub_1',
  cancel_at_period_end: true,
  current_period_end: PERIOD_END_SECONDS,
};

beforeEach(() => {
  vi.clearAllMocks();
  sb.reset();
  stripe.subscriptions.update.mockResolvedValue(canceledSubscription);
});

describe('POST /api/cancel-subscription', () => {
  it('returns 400 when no userEmail is provided', async () => {
    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, { method: 'POST', body: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('User email is required');
  });

  it('returns 404 when the user does not exist', async () => {
    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'ghost@b.com' },
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('User not found');
  });

  it('returns 404 when there is no stored customer id and Stripe has none for the email', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', stripe_customer_id: null });
    stripe.customers.list.mockResolvedValue({ data: [] });

    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No customer found');
  });

  it('falls back to looking up the Stripe customer by email when no id is stored', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', stripe_customer_id: null });
    stripe.customers.list.mockResolvedValue({ data: [{ id: 'cus_found' }] });
    stripe.subscriptions.list.mockResolvedValue({ data: [canceledSubscription] });

    await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));

    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'a@b.com', limit: 1 });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
  });

  it('returns 404 when the customer has no subscription', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', stripe_customer_id: 'cus_1' });
    stripe.subscriptions.list.mockResolvedValue({ data: [] });

    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No subscription found');
  });

  it('cancels at period end and records it on the user row', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      stripe_customer_id: 'cus_1',
      subscription_status: 'active',
    });
    stripe.subscriptions.list.mockResolvedValue({ data: [canceledSubscription] });

    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.subscription.id).toBe('sub_1');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });

    const user = sb.state.tables.users[0];
    expect(user.cancel_at_period_end).toBe(true);
    expect(user.subscription_end_date).toBe(new Date(PERIOD_END_SECONDS * 1000).toISOString());
  });

  it('KNOWN BUG (Stripe subscription-lifecycle PR #1): cancellation keeps subscription_status "active" — the user stays premium forever because nothing downgrades the row when subscription_end_date passes. Current behavior asserted.', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      stripe_customer_id: 'cus_1',
      subscription_status: 'active',
    });
    stripe.subscriptions.list.mockResolvedValue({ data: [canceledSubscription] });

    await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));

    // Current behavior: still 'active' after cancellation.
    expect(sb.state.tables.users[0].subscription_status).toBe('active');
  });

  it('returns 500 when the database update fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', stripe_customer_id: 'cus_1' });
    stripe.subscriptions.list.mockResolvedValue({ data: [canceledSubscription] });
    sb.state.errors.updates = { code: 'XX500', message: 'boom' }; // fail the UPDATE, not the SELECT

    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to cancel subscription');
  });

  it('returns 500 when the Stripe update fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', stripe_customer_id: 'cus_1' });
    stripe.subscriptions.list.mockResolvedValue({ data: [canceledSubscription] });
    stripe.subscriptions.update.mockRejectedValue(new Error('stripe down'));

    const res = await POST(makeRequest(`${BASE}/api/cancel-subscription`, {
      method: 'POST',
      body: { userEmail: 'a@b.com' },
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to cancel subscription');
    expect(body.details).toBe('stripe down');
  });
});
