import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(request) {
  try {
    const { credential } = await request.json();

    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // Check if user exists in Supabase
    let { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      // User doesn't exist, create new user
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            email,
            name,
            picture: picture,
            saved_responses: [],
            daily_usage: 0,
            total_usage: 0,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      user = newUser;
    } else if (fetchError) {
      throw fetchError;
    }

    // Return user data
    return NextResponse.json({
      user: {
        email: user.email,
        name: user.name,
        avatar_url: user.picture,
      },
    });

  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
} 