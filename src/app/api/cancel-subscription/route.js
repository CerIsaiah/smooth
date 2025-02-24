import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create a Supabase client
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

export async function POST(request) {
  try {
    const { userEmail } = await request.json();

    if (!userEmail) {
      console.error('No user email provided');
      return NextResponse.json({ error: 'User email is required' }, { status: 400 });
    }

    console.log('Attempting to cancel subscription for:', userEmail);

    // First check if user exists in Supabase
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      console.error('User not found in database:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let customerId = user.stripe_customer_id;

    // If no stored customer ID, try to find customer in Stripe
    if (!customerId) {
      const customers = await stripe.customers.list({ 
        email: userEmail,
        limit: 1 
      });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        // Update user with Stripe customer ID
        await supabase
          .from('users')
          .update({ stripe_customer_id: customerId })
          .eq('email', userEmail);
      }
    }

    if (!customerId) {
      console.error('No Stripe customer found for:', userEmail);
      return NextResponse.json({ error: 'No customer found' }, { status: 404 });
    }

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all', // Include trials and active subscriptions
      limit: 1,
    });

    console.log('Found subscriptions:', subscriptions.data.length);

    const subscription = subscriptions.data[0];

    if (!subscription) {
      console.error('No subscription found for customer:', customerId);
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    // Cancel at period end instead of immediately
    const canceledSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    // Update user's subscription status in database
    await supabase
      .from('users')
      .update({ 
        subscription_status: 'canceling',
        subscription_end_date: new Date(canceledSubscription.current_period_end * 1000).toISOString()
      })
      .eq('email', userEmail);

    console.log('Successfully canceled subscription:', subscription.id);

    return NextResponse.json({ 
      status: 'success',
      message: 'Subscription will be canceled at the end of the billing period',
      subscription: canceledSubscription 
    });

  } catch (error) {
    console.error('Detailed error in cancel-subscription:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription', details: error.message },
      { status: 500 }
    );
  }
} 