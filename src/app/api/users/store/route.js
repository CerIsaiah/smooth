import { get, set } from '@vercel/edge-config';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const userData = await request.json();
    const { email } = userData;

    // Get existing users or initialize empty object
    const users = await get('users') || {};
    
    // Update or add the user
    users[email] = userData;

    // Store updated users object
    await set('users', users);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing user data:', error);
    return NextResponse.json(
      { error: 'Failed to store user data' },
      { status: 500 }
    );
  }
} 