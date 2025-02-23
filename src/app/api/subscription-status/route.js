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

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Query the subscriptions table or users table where you store subscription info
    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching subscription:', error);
      return NextResponse.json({ error: 'Failed to fetch subscription status' }, { status: 500 });
    }

    // Ensure we return one of: 'standard', 'premium', or null (free)
    let status = user?.subscription_status;
    if (status !== 'standard' && status !== 'premium') {
      status = null;
    }

    return NextResponse.json({ status: status || null });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 