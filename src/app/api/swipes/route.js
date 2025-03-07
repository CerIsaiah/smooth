import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT } from '@/app/constants';
import { incrementUsage, getNextResetTime, checkUsageLimits } from '@/utils/usageTracking';

/**
 * Swipes API Route
 * 
 * This file handles tracking user swipes and managing usage limits.
 * 
 * Main Features:
 * - Tracks daily and total usage
 * - Manages anonymous vs authenticated usage
 * - Saves right-swiped responses
 * - Enforces usage limits
 * 
 * Dependencies:
 * - @supabase/supabase-js: For database operations
 * - @/utils/usageTracking: For usage management
 * 
 * Side Effects:
 * - Updates ip_usage and users tables
 * - Creates usage records for new users/IPs
 * - Saves responses to user accounts
 * 
 * Connected Files:
 * - src/app/responses/page.js: Calls this endpoint for swipe actions
 * - src/utils/dbOperations.js: Database operations
 * - src/utils/usageTracking.js: Usage tracking logic
 */
export async function GET(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userEmail = request.headers.get('x-user-email');
    
    // Check limits for either user or IP
    const limitCheck = await checkUsageLimits(
      userEmail || requestIP, 
      Boolean(userEmail)
    );

    return NextResponse.json(limitCheck);

  } catch (error) {
    console.error('Error in GET /api/swipes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const userEmail = request.headers.get('x-user-email');
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // Increment usage for either user or IP
    const usageResult = await incrementUsage(
      userEmail || requestIP, 
      Boolean(userEmail)
    );

    // If can't swipe, return error
    if (!usageResult.canSwipe) {
      return NextResponse.json(usageResult, { status: 429 });
    }

    // Handle response saving if it's a right swipe
    if (body.direction === 'right' && body.response && userEmail) {
      await saveResponse(userEmail, body.response);
    }

    return NextResponse.json(usageResult);

  } catch (error) {
    console.error('Error in POST /api/swipes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

