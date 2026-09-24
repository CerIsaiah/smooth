import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Add basic console log to verify the file is loaded
console.log('Webhook route file loaded');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Log configuration status
console.log('Stripe Configuration:', {
  hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
  hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
});

// Create a Supabase client with the service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function isoFromUnix(ts) {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.toLowerCase().trim() : '';
}

// Legacy fallback: the 3-day trial previously computed from wall clock.
// Used only when the Stripe subscription object carries no trial dates.
function defaultTrialEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString();
}

// Resolve the users row for a Stripe customer. Returns null when no user is
// linked (a permanent condition — callers respond 200 so Stripe stops
// redelivering an event we can never process). Throws on transient DB errors
// (callers respond 500 so Stripe retries the delivery).
async function findUserByStripeCustomer(customerId) {
  if (!customerId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Downgrade payload matching the default free-user shape created by
// getUserData() in dbOperations.js. trial_started_at and stripe_customer_id
// are kept on purpose: trial_started_at gates re-trialing in
// /api/checkout_sessions and hadTrial in /api/subscription-status, and the
// customer id keeps the user resolvable for later billing events.
function freeTierUpdates() {
  return {
    subscription_type: 'standard',
    subscription_status: 'inactive',
    is_trial: false,
    trial_end_date: null,
    trial_ending_soon: false,
    subscription_end_date: null,
    cancel_at_period_end: false,
    subscription_updated_at: new Date().toISOString()
  };
}

async function handleCheckoutSessionCompleted(event) {
  const session = event.data.object;
  // /api/checkout_sessions writes user_email into session metadata;
  // customer_email is the fallback for sessions created without it.
  const userEmail =
    normalizeEmail(session.metadata?.user_email) ||
    normalizeEmail(session.customer_email);

  console.log('📦 Processing checkout.session.completed:', {
    sessionId: session.id,
    userEmail,
    customerId: session.customer
  });

  if (!userEmail) {
    // Permanent condition: nothing to update. Respond 200 so Stripe does not
    // retry a delivery we can never process.
    console.error('❌ No user email in checkout session; skipping');
    return NextResponse.json({ received: true });
  }

  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('email', userEmail)
    .maybeSingle();

  if (fetchError) {
    // Transient DB failure: 500 makes Stripe redeliver.
    console.error('❌ Failed to fetch user:', { userEmail, error: fetchError });
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }

  if (!user) {
    // Unknown email: permanent, respond 200 to stop redelivery.
    console.error('❌ No user found for email; skipping:', userEmail);
    return NextResponse.json({ received: true });
  }

  // The Stripe subscription (created with trial_period_days: 3 by
  // /api/checkout_sessions) is the source of truth for trial and period
  // dates. Deriving dates from the subscription instead of wall clock also
  // makes redeliveries idempotent: the same event always writes the same
  // values instead of extending the trial by "now + 3 days" on each retry.
  let subscription = null;
  if (session.subscription) {
    try {
      subscription = await stripe.subscriptions.retrieve(session.subscription);
    } catch (err) {
      console.error('❌ Failed to retrieve subscription; retrying:', {
        subscriptionId: session.subscription,
        error: err.message
      });
      return NextResponse.json(
        { error: 'Failed to retrieve subscription' },
        { status: 500 }
      );
    }
  }

  // trial_started_at is the same flag /api/checkout_sessions gates on: a user
  // who already trialed gets no second trial on a renewal checkout and goes
  // straight to paid premium. Omitted keys below leave existing columns
  // untouched (partial update), so redelivered events cannot clobber trial
  // fields written by the first delivery.
  const isFirstTrial = !user.trial_started_at && !user.is_trial;

  const updates = {
    subscription_type: 'premium',
    subscription_status: 'active',
    stripe_customer_id: session.customer || user.stripe_customer_id,
    cancel_at_period_end: false,
    trial_ending_soon: false,
    subscription_updated_at: new Date().toISOString()
  };

  if (subscription) {
    updates.cancel_at_period_end = !!subscription.cancel_at_period_end;
    if (subscription.current_period_end) {
      updates.subscription_end_date = isoFromUnix(subscription.current_period_end);
    }
  }

  if (isFirstTrial) {
    updates.is_trial = true;
    updates.trial_started_at =
      isoFromUnix(subscription?.trial_start) || new Date().toISOString();
    updates.trial_end_date =
      isoFromUnix(subscription?.trial_end) || defaultTrialEnd();
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to update subscription:', {
      error: updateError,
      userEmail,
      sessionId: session.id
    });
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }

  console.log('✅ Subscription activated:', {
    userEmail,
    isFirstTrial,
    customerId: session.customer
  });
  return NextResponse.json({ received: true });
}

async function handleSubscriptionUpdated(event) {
  const subscription = event.data.object;

  let user;
  try {
    user = await findUserByStripeCustomer(subscription.customer);
  } catch (err) {
    console.error('❌ Failed to resolve user for subscription.updated:', {
      customerId: subscription.customer,
      error: err.message
    });
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
  }

  if (!user) {
    console.error('❌ No user for customer; skipping subscription.updated:', {
      customerId: subscription.customer
    });
    return NextResponse.json({ received: true });
  }

  const updates = { subscription_updated_at: new Date().toISOString() };
  const status = subscription.status;

  if (status === 'active' || status === 'trialing') {
    // Paying (or trialing) customer: premium access. Mirroring
    // cancel_at_period_end keeps the cancel-at-period-end flow (set by
    // /api/cancel-subscription or the Stripe dashboard) visible in the DB
    // without ever reverting a pending cancellation.
    updates.subscription_type = 'premium';
    updates.subscription_status = 'active';
    updates.cancel_at_period_end = !!subscription.cancel_at_period_end;
    if (subscription.current_period_end) {
      updates.subscription_end_date = isoFromUnix(subscription.current_period_end);
    }
    if (status === 'active') {
      // Trial converted to paid (or a past_due subscription recovered):
      // the trial is over regardless of what the row last said.
      updates.is_trial = false;
      updates.trial_ending_soon = false;
      updates.trial_end_date = null;
    } else {
      // Still trialing: mirror Stripe's trial dates.
      updates.is_trial = true;
      if (subscription.trial_start) {
        updates.trial_started_at = isoFromUnix(subscription.trial_start);
      }
      if (subscription.trial_end) {
        updates.trial_end_date = isoFromUnix(subscription.trial_end);
      }
    }
  } else if (status === 'past_due' || status === 'unpaid') {
    // Payment failed: suspend premium access (free-tier limits) but keep
    // premium type — Stripe dunning may still recover the subscription,
    // and a later update to 'active' flips the row back.
    updates.subscription_status = 'past_due';
  } else {
    // 'canceled' / 'incomplete' / etc. are handled by
    // customer.subscription.deleted or not applicable; do not guess a state.
    console.log('ℹ️ Ignoring subscription.updated status:', status);
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to update user for subscription.updated:', {
      userId: user.id,
      error: updateError
    });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;

  let user;
  try {
    user = await findUserByStripeCustomer(subscription.customer);
  } catch (err) {
    console.error('❌ Failed to resolve user for subscription.deleted:', {
      customerId: subscription.customer,
      error: err.message
    });
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
  }

  if (!user) {
    console.error('❌ No user for customer; skipping subscription.deleted:', {
      customerId: subscription.customer
    });
    return NextResponse.json({ received: true });
  }

  // The webhook-owned downgrade. This event covers: a cancel-at-period-end
  // subscription reaching period end (the /api/cancel-subscription flow),
  // immediate cancellation, and a trial ending without a payment method
  // (end_behavior: 'cancel'). Idempotent: re-applying the same free-tier
  // values on redelivery is a no-op.
  const { error: updateError } = await supabase
    .from('users')
    .update(freeTierUpdates())
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to downgrade user for subscription.deleted:', {
      userId: user.id,
      error: updateError
    });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  console.log('✅ Subscription ended; downgraded to free tier:', {
    userId: user.id,
    customerId: subscription.customer
  });
  return NextResponse.json({ received: true });
}

async function handleTrialWillEnd(event) {
  const subscription = event.data.object;

  let user;
  try {
    user = await findUserByStripeCustomer(subscription.customer);
  } catch (err) {
    console.error('❌ Failed to resolve user for trial_will_end:', {
      customerId: subscription.customer,
      error: err.message
    });
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
  }

  if (!user) {
    console.error('❌ No user for customer; skipping trial_will_end:', {
      customerId: subscription.customer
    });
    return NextResponse.json({ received: true });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ trial_ending_soon: true })
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to update user for trial_will_end:', {
      userId: user.id,
      error: updateError
    });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;

  if (!invoice.subscription) {
    // The app only bills via subscriptions; ignore unrelated invoices.
    console.log('ℹ️ payment_failed for non-subscription invoice; skipping:', {
      invoiceId: invoice.id
    });
    return NextResponse.json({ received: true });
  }

  let user;
  try {
    user = await findUserByStripeCustomer(invoice.customer);
  } catch (err) {
    console.error('❌ Failed to resolve user for invoice.payment_failed:', {
      customerId: invoice.customer,
      error: err.message
    });
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
  }

  if (!user) {
    console.error('❌ No user for customer; skipping invoice.payment_failed:', {
      customerId: invoice.customer
    });
    return NextResponse.json({ received: true });
  }

  // Mark past_due rather than a hard downgrade: the subscription still
  // exists and Stripe dunning may collect. Full downgrade to free tier
  // happens via customer.subscription.deleted if it is never recovered.
  // Idempotent: writing 'past_due' again on redelivery is a no-op.
  const { error: updateError } = await supabase
    .from('users')
    .update({
      subscription_status: 'past_due',
      subscription_updated_at: new Date().toISOString()
    })
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to update user for invoice.payment_failed:', {
      userId: user.id,
      error: updateError
    });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export async function POST(req) {
  // Log every incoming request
  console.log('🔔 Webhook endpoint hit!', {
    method: req.method,
    headers: Object.fromEntries(req.headers),
    timestamp: new Date().toISOString()
  });

  try {
    const payload = await req.text();
    console.log('📦 Received webhook payload length:', payload.length);

    const sig = req.headers.get('stripe-signature');
    console.log('🔑 Stripe signature present:', !!sig);

    let event;

    try {
      console.log('Webhook received, verifying signature...');
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
      console.log('Webhook verified successfully. Event:', {
        type: event.type,
        id: event.id
      });
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', {
        error: err.message,
        signature: sig ? 'Present' : 'Missing',
        endpointSecret: endpointSecret ? 'Present' : 'Missing'
      });
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    let response;

    switch (event.type) {
      case 'checkout.session.completed':
        response = await handleCheckoutSessionCompleted(event);
        break;
      case 'customer.subscription.updated':
        response = await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        response = await handleSubscriptionDeleted(event);
        break;
      case 'customer.subscription.trial_will_end':
        response = await handleTrialWillEnd(event);
        break;
      case 'invoice.payment_failed':
        response = await handleInvoicePaymentFailed(event);
        break;
      default:
        // Unknown event types are acknowledged so Stripe stops retrying.
        console.log('ℹ️ Unhandled event type:', event.type);
        response = NextResponse.json({ received: true });
    }

    return response;
  } catch (error) {
    // Unexpected errors respond 500 so Stripe redelivers the event.
    console.error('❌ Webhook processing error:', {
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Add OPTIONS handler for CORS if needed
export async function OPTIONS(req) {
  console.log('OPTIONS request received');
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
    },
  });
}
