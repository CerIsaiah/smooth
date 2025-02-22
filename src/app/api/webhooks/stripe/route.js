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
      console.log('Webhook event type:', event.type);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      console.error('Received signature:', sig);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details.email;
      
      console.log('Processing checkout session:', session.id);
      console.log('Customer email:', customerEmail);

      // First check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select()
        .eq('email', customerEmail)
        .single();

      if (checkError || !existingUser) {
        console.error('User not found:', customerEmail);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

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