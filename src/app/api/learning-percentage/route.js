import { NextResponse } from 'next/server';
import { getLearningPercentage } from '@/utils/usageTracking';
import { resolveIdentity } from '@/utils/auth';

export async function GET(request) {
  try {
    // Identity comes from the verified session cookie; anonymous requests
    // (no session) get the minimum percentage.
    const { email } = resolveIdentity(request);
    const result = await getLearningPercentage(email);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in learning-percentage route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 