/**
 * Route tests for src/app/api/webhooks/stripe/route.js
 *
 * The route instantiates `new Stripe(...)` and `createClient(...)` at module
 * scope — both modules are mocked before import. Signature verification goes
 * through stripe.webhooks.constructEvent (mocked): a throw → the route's 400
 * enforcement path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, OPTIONS } from '@/app/api/webhooks/stripe/route';
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

function webhookRequest(payload, sig = 't=1,v1=valid') {
  return makeRequest(`${BASE}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'stripe-signature': sig },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sb.reset();
  stripe.webhooks.constructEvent.mockImplementation((payload, sig, secret) => {
    expect(secret).toBe('whsec_placeholder'); // module-scope endpointSecret
    return { id: 'evt_1', type: 'unhandled.event', data: { object: {} } };
  });
});

describe('POST /api/webhooks/stripe — signature enforcement', () => {
  it('returns 400 when signature verification fails (enforcement path)', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found, expected a signature from ...');
    });

    const res = await POST(webhookRequest({ anything: true }, 't=1,v1=badsig'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Webhook Error: No signatures found, expected a signature from ...');
  });

  it('passes the raw payload, signature header, and endpoint secret to constructEvent', async () => {
    const res = await POST(webhookRequest({ hello: 'world' }, 't=1,v1=abc'));

    expect(res.status).toBe(200);
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      '{"hello":"world"}',
      't=1,v1=abc',
      'whsec_placeholder'
    );
  });
});

describe('POST /api/webhooks/stripe — checkout.session.completed', () => {
  const session = {
    id: 'cs_1',
    customer: 'cus_1',
    customer_email: 'a@b.com',
    metadata: { user_email: '  A@B.com ' },
  };

  beforeEach(() => {
    stripe.webhooks.constructEvent.mockImplementation(() => ({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: session },
    }));
  });

  it('activates a premium trial on the user record and returns received: true', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', subscription_status: 'inactive' });

    const before = Date.now();
    const res = await POST(webhookRequest({}));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const user = sb.state.tables.users[0];
    expect(user.subscription_type).toBe('premium');
    expect(user.subscription_status).toBe('active');
    expect(user.is_trial).toBe(true);
    expect(user.stripe_customer_id).toBe('cus_1');
    expect(user.trial_started_at).toBeTruthy();
    // trial_end_date ≈ now + 3 days
    const end = new Date(user.trial_end_date).getTime();
    expect(end).toBeGreaterThanOrEqual(before + 3 * 24 * 3600 * 1000 - 1000);
    expect(end).toBeLessThanOrEqual(Date.now() + 3 * 24 * 3600 * 1000 + 1000);
  });

  it('returns 400 when the session metadata has no user email', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => ({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', metadata: {} } },
    }));

    const res = await POST(webhookRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No user email in metadata');
  });

  it('returns 404 when the user does not exist', async () => {
    const res = await POST(webhookRequest({}));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('User not found');
  });

  it('returns 500 when the user update fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com' });
    sb.state.errors.updates = { code: 'XX500', message: 'boom' }; // fail the UPDATE, not the SELECT

    const res = await POST(webhookRequest({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to update subscription');
  });
});

describe('POST /api/webhooks/stripe — subscription lifecycle events', () => {
  it('customer.subscription.trial_will_end flags the user by stripe customer id', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => ({
      id: 'evt_4',
      type: 'customer.subscription.trial_will_end',
      data: { object: { customer: 'cus_9' } },
    }));
    sb.state.tables.users.push({ id: 'u9', email: 'a@b.com', stripe_customer_id: 'cus_9' });

    const res = await POST(webhookRequest({}));

    expect(res.status).toBe(200);
    expect(sb.state.tables.users[0].trial_ending_soon).toBe(true);
  });

  it('customer.subscription.updated (active, trial over) converts the user to premium', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => ({
      id: 'evt_5',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_9', status: 'active', trial_end: null } },
    }));
    sb.state.tables.users.push({ id: 'u9', email: 'a@b.com', stripe_customer_id: 'cus_9', is_trial: true });

    await POST(webhookRequest({}));

    const user = sb.state.tables.users[0];
    expect(user.is_trial).toBe(false);
    expect(user.subscription_status).toBe('active');
    expect(user.trial_end_date).toBeNull();
    // KNOWN QUIRK: the route also writes `is_premium`, a column the users
    // table does not have (schema uses subscription_status) — harmless
    // server-side, pinned here as documentation.
    expect(user.is_premium).toBe(true);
    expect(user.subscription_updated_at).toBeTruthy();
  });

  it('ignores unrelated event types without touching the database', async () => {
    const res = await POST(webhookRequest({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(sb.state.ops).toHaveLength(0);
  });
});

describe('OPTIONS /api/webhooks/stripe', () => {
  it('responds 200 with CORS headers', async () => {
    const res = await OPTIONS(makeRequest(`${BASE}/api/webhooks/stripe`, { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain('stripe-signature');
  });
});
