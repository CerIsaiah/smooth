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



export async function GET(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userEmail = request.headers.get('x-user-email');
    
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
    let body = {};
    try {
      body = await request.json();
    } catch (error) {
      console.warn('Invalid or empty JSON body received:', error);
    }

    const userEmail = request.headers.get('x-user-email');
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    console.log('Processing swipe for:', { userEmail, requestIP });
    
    // Check usage first
    const currentUsage = await checkUsageLimits(
      userEmail || requestIP, 
      Boolean(userEmail)
    );
    
    console.log('Current usage:', currentUsage);
    
    // Determine if user can swipe
    const canSwipe = userEmail 
      ? (currentUsage.isPremium || currentUsage.dailySwipes < FREE_USER_DAILY_LIMIT)
      : (currentUsage.dailySwipes < ANONYMOUS_USAGE_LIMIT);
      
    // Only increment usage if under limit or premium
    let usageResult = currentUsage;
    if (canSwipe) {
      try {
        console.log('Incrementing usage...');
        usageResult = await incrementUsage(
          userEmail || requestIP, 
          Boolean(userEmail)
        );
        console.log('Usage incremented:', usageResult);
      } catch (error) {
        console.error('Error incrementing usage:', error);
        throw error; // Propagate the error instead of silently falling back
      }
    }
    
    // Return detailed response
    const response = {
      ...usageResult,
      canSwipe,
      requiresSignIn: !userEmail && usageResult.dailySwipes >= ANONYMOUS_USAGE_LIMIT,
      requiresUpgrade: userEmail && !usageResult.isPremium && usageResult.dailySwipes >= FREE_USER_DAILY_LIMIT
    };
    
    console.log('Returning response:', response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in POST /api/swipes:', error);
    return NextResponse.json({ 
      error: error.message,
      canSwipe: false  // Changed to false on error
    }, { status: 500 });
  }
}

