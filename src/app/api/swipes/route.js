import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { 
  ANONYMOUS_USAGE_LIMIT,
  FREE_USER_DAILY_LIMIT 
} from '@/app/constants';
import { 
  checkUsageStatus, 
  incrementUsage, 
  getNextResetTime 
} from '@/utils/usageTracking';
import { checkUsageLimits } from '@/utils/dbOperations';

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
 * - @/utils/dbOperations: For usage management
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

// Add this function before the route handlers
async function saveResponse(userEmail, response) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { error } = await supabase
      .from('saved_responses')
      .insert([
        {
          user_email: userEmail,
          response: response,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
  } catch (error) {
    console.error('Error saving response:', error);
    throw error;
  }
}

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

