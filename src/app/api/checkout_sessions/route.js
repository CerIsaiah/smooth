import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    // Check if Stripe is properly configured
    if (!process.env.STRIPE_SECRET_KEY || !stripe) {
      console.error('Stripe configuration error:', { 
        hasKey: !!process.env.STRIPE_SECRET_KEY,
        hasStripe: !!stripe 
      });
      return NextResponse.json(
        { error: 'Stripe is not properly configured' },
        { status: 500 }
      );
    }

    // Parse the request body for the user ID
    const body = await req.json();
    const userId = body.userId;
    
    console.log('Processing checkout for user ID:', userId);
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Please sign in to continue with checkout' }, 
        { status: 401 }
      );
    }

    // Query the user profile from your database
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // If profile doesn't exist, this indicates an authentication issue
    if (dbError || !profile) {
      console.error('User profile not found:', { userId, error: dbError });
      return NextResponse.json(
        { 
          error: 'Authentication error. Please try signing out and signing in again.',
          details: 'User profile not found'
        }, 
        { status: 401 }
      );
    }

    console.log('Found user profile:', { userId: profile.user_id });

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SmoothRizz Premium',
              description: 'Unlimited access to all premium features',
            },
            unit_amount: 100, // $1.00 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=true`,
      customer_email: profile.email,
      metadata: {
        user_id: userId,
        profile_id: profile.id
      }
    });

    console.log('Checkout session created:', session.id);
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('Detailed error in checkout session:', {
      message: error.message,
      stack: error.stack,
      type: error.type
    });
    
    return NextResponse.json(
      { error: 'Error creating checkout session. Please try again.' },
      { status: 500 }
    );
  }
}

// Add OPTIONS handler for CORS if needed
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Email',
    },
  });
} 