import { createOrUpdateUser } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const data = await request.json();
    const user = await createOrUpdateUser(data);
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 