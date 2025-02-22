import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req) {
  try {
    const payload = await req.text();
    const sig = req.headers.get('stripe-signature');

    let event;

    try {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details.email;

      // Update user's subscription details
      const { data: user, error: userError } = await supabase
        .from('users')
        .update({
          subscription_type: 'premium',
          subscription_status: 'active',
          subscription_updated_at: new Date().toISOString()
        })
        .eq('email', customerEmail)
        .select();

      if (userError) {
        console.error('Error updating user subscription:', userError);
        return NextResponse.json({ error: 'Error updating subscription' }, { status: 500 });
      }

      // Log successful update
      console.log('Successfully updated subscription for:', customerEmail);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 