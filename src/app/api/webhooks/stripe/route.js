import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

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

export async function POST(req) {
  try {
    const payload = await req.text();
    const sig = req.headers.get('stripe-signature');

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      
      console.log('📦 Processing checkout.session.completed:', {
        sessionId: session.id,
        userId: userId,
        customerEmail: session.customer_email,
        metadata: session.metadata
      });

      if (!userId) {
        console.error('❌ No userId found in session metadata');
        return NextResponse.json({ error: 'No userId in metadata' }, { status: 400 });
      }

      // First, verify the user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError || !existingUser) {
        console.error('❌ Failed to fetch user:', {
          userId,
          error: fetchError,
          userFound: !!existingUser
        });
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      console.log('✅ Found user:', {
        userId: existingUser.id,
        currentSubscriptionType: existingUser.subscription_type,
        currentStatus: existingUser.subscription_status
      });

      // Update user's subscription
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          subscription_type: 'premium',
          subscription_status: 'active',
          subscription_updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update subscription:', {
          error: updateError,
          userId: userId,
          sessionId: session.id
        });
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
      }

      console.log('✅ Successfully updated subscription:', {
        userId: userId,
        oldType: existingUser.subscription_type,
        newType: updatedUser.subscription_type,
        oldStatus: existingUser.subscription_status,
        newStatus: updatedUser.subscription_status
      });

      // Verify the update was successful
      const { data: verifyUser, error: verifyError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (verifyError) {
        console.error('❌ Failed to verify update:', {
          error: verifyError,
          userId: userId
        });
      } else {
        console.log('✅ Verified subscription update:', {
          subscriptionType: verifyUser.subscription_type,
          subscriptionStatus: verifyUser.subscription_status,
          updatedAt: verifyUser.subscription_updated_at
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook processing error:', {
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 