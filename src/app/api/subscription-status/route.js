import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const userEmail = searchParams.get('userEmail')?.toLowerCase().trim();

    if (!userId && !userEmail) {
      return NextResponse.json({ error: 'User ID or email is required' }, { status: 400 });
    }

    // Query using either userId or email
    const query = supabase.from('users').select('subscription_type, subscription_status, email');
    if (userId) {
      query.eq('id', userId);
    } else {
      query.eq('email', userEmail);
    }
    
    const { data: user, error } = await query.single();

    if (error) {
      console.error('Error fetching subscription:', error);
      return NextResponse.json({ error: 'Failed to fetch subscription status' }, { status: 500 });
    }

    // A user has an active subscription only if status is "active"
    let status = null;
    if (user?.subscription_status === 'active') {
      status = user.subscription_type; // Will be either "standard" or "premium"
    }

    return NextResponse.json({ status: status || null });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 