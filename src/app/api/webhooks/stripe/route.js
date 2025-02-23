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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userEmail = (session.metadata?.user_email || '').toLowerCase().trim();
      
      console.log('📦 Processing checkout.session.completed:', {
        sessionId: session.id,
        userEmail: userEmail,
        customerEmail: session.customer_email,
        metadata: session.metadata
      });

      if (!userEmail) {
        console.error('❌ No user email found in session metadata');
        return NextResponse.json({ error: 'No user email in metadata' }, { status: 400 });
      }

      // First, verify the user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (fetchError || !existingUser) {
        console.error('❌ Failed to fetch user:', {
          userEmail,
          error: fetchError,
          userFound: !!existingUser
        });
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      console.log('✅ Found user:', {
        userEmail: existingUser.email,
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
        .eq('email', userEmail)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update subscription:', {
          error: updateError,
          userEmail: userEmail,
          sessionId: session.id
        });
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
      }

      console.log('✅ Successfully updated subscription:', {
        userEmail: userEmail,
        oldType: existingUser.subscription_type,
        newType: updatedUser.subscription_type,
        oldStatus: existingUser.subscription_status,
        newStatus: updatedUser.subscription_status
      });

      // Verify the update was successful
      const { data: verifyUser, error: verifyError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (verifyError) {
        console.error('❌ Failed to verify update:', {
          error: verifyError,
          userEmail: userEmail
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