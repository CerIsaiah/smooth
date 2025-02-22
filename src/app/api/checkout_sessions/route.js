import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/utils/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    if (!stripe) {
      throw new Error('Stripe is not properly initialized');
    }

    const userEmail = req.headers.get('X-User-Email');
    console.log('Processing checkout for email:', userEmail);
    
    if (!userEmail) {
      return NextResponse.json({ error: 'No user email provided' }, { status: 401 });
    }

    // Query the user from your database
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', userEmail)
      .single();
    
    if (dbError || !user) {
      console.error('Database error:', dbError);
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    console.log('Found user:', { userId: user.id });

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
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=true`,
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        user_email: user.email
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
      { error: 'Error creating checkout session: ' + error.message },
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