import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(req) {
  try {
    const { email, userId } = await req.json();

    if (!email || !userId) {
      console.error('Missing required fields:', { email, userId });
      return NextResponse.json({ error: 'Email and userId are required' }, { status: 400 });
    }

    console.log('Creating checkout session for:', { email, userId }); // Debug log

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SmoothRizz Premium',
              description: 'Unlimited access to all premium features',
            },
            unit_amount: 100, // $1.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=true`,
      customer_email: email,
      metadata: {
        type: 'premium_subscription',
        user_email: email,
        user_id: userId,
        subscription_type: 'premium'
      }
    });

    console.log('Checkout session created:', session.id); // Debug log

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Error creating checkout session' },
      { status: 500 }
    );
  }
} 