import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT } from '@/app/constants';
import { incrementUsage, getNextResetTime } from '@/utils/usageTracking';

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
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check premium/trial status for signed-in users
    if (userEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('is_premium, is_trial, trial_end_date, subscription_status')
        .eq('email', userEmail)
        .single();

      const now = new Date();
      const isTrialActive = userData?.is_trial && 
        userData?.trial_end_date && 
        new Date(userData.trial_end_date) > now;

      // Treat trial users same as premium users
      if (userData?.is_premium || isTrialActive || userData?.subscription_status === 'active') {
        return NextResponse.json({ 
          isPremium: true,
          dailySwipes: 0, // Don't count swipes for premium/trial users
          isTrial: isTrialActive,
          limitReached: false,
          ...(isTrialActive && {
            trialEndsAt: userData.trial_end_date
          })
        });
      }
    }

    // Get both records
    const { data: ipData } = await supabase
      .from('ip_usage')
      .select('*')
      .eq('ip_address', requestIP)
      .single();

    const { data: userData } = userEmail ? await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .single() : { data: null };

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check if user is in trial period
    const isTrialActive = userData?.is_trial && 
      userData?.trial_end_date && 
      new Date(userData.trial_end_date) > now;

    // If user is in trial, treat them as premium
    if (isTrialActive) {
      return NextResponse.json({ 
        isPremium: true,
        isTrial: true,
        limitReached: false,
        trialEndsAt: userData.trial_end_date
      });
    }

    // Calculate total daily usage for non-premium/non-trial users
    const ipUsage = ipData?.last_reset === today ? ipData.daily_usage : 0;
    const userUsage = userData?.last_reset === today ? userData.daily_usage : 0;
    const totalDailyUsage = ipUsage + userUsage;

    const limitReached = totalDailyUsage >= ANONYMOUS_USAGE_LIMIT;

    const nextResetTime = getNextResetTime().toISOString();

    return NextResponse.json({ 
      dailySwipes: totalDailyUsage,
      limitReached,
      requiresSignIn: limitReached && !userEmail,
      requiresUpgrade: limitReached && userEmail,
      nextResetTime,
      ...(limitReached && userEmail && {
        timeRemaining: Math.ceil((new Date(nextResetTime).getTime() - now.getTime()) / 1000)
      })
    });

  } catch (error) {
    console.error('Error fetching swipe count:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 

export async function POST(request) {
  try {
    const { direction, response } = await request.json();
    const userEmail = request.headers.get('x-user-email');
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    console.log('Swipe request:', { direction, userEmail, requestIP }); // Debug log
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // First increment usage - make sure userEmail is passed if present
    const usageData = await incrementUsage(requestIP, userEmail || null);

    // If it's a right swipe and we have a response to save, save it
    if (direction === 'right' && response && userEmail) {
      console.log('Attempting to save response:', { 
        response, 
        userEmail,
        responseType: typeof response,
        responseStringified: JSON.stringify(response)
      }); // Enhanced debug log

      // Ensure response is properly formatted as a JSON string
      const formattedResponse = typeof response === 'string' ? response : JSON.stringify(response);

      const { data: saveData, error: saveError } = await supabase
        .from('users')
        .update({
          saved_responses: supabase.sql`array_append(COALESCE(saved_responses, '[]'::jsonb), ${formattedResponse}::jsonb)`
        })
        .eq('email', userEmail)
        .select('saved_responses');

      if (saveError) {
        console.error('Error saving response:', {
          error: saveError,
          details: saveError.details,
          message: saveError.message,
          hint: saveError.hint,
          formattedResponse
        });
      } else {
        console.log('Response saved successfully:', {
          saveData,
          formattedResponse
        });
      }
    }

    // Get fresh usage data after the increment
    const { data: freshUserData } = userEmail ? await supabase
      .from('users')
      .select('daily_usage, total_usage, subscription_status, is_trial')
      .eq('email', userEmail)
      .single() : { data: null };

    console.log('Fresh user data:', freshUserData); // Debug log

    // Return the updated usage data
    return NextResponse.json({
      ...usageData,
      ...(freshUserData && {
        dailySwipes: freshUserData.daily_usage,
        totalUsage: freshUserData.total_usage,
        isPremium: freshUserData.subscription_status === 'active',
        isTrial: freshUserData.is_trial
      })
    });

  } catch (error) {
    console.error('Error in POST /api/swipes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

