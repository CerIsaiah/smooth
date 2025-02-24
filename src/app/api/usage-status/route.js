import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT, FREE_USER_DAILY_LIMIT } from '@/app/constants';

// Configuration for reset timing (in hours)
const RESET_INTERVAL = 24; // Easy to change: 24 hours = daily, 12 = twice daily, etc.

function getNextResetTime(userTimezoneOffset = 0) {
  // Convert timezone offset from minutes to milliseconds
  const offsetMs = userTimezoneOffset * 60 * 1000;
  
  const now = new Date();
  const userLocalTime = new Date(now.getTime() - offsetMs);
  
  // Calculate next reset time
  const nextReset = new Date(userLocalTime);
  nextReset.setHours(nextReset.getHours() + RESET_INTERVAL);
  nextReset.setMinutes(0, 0, 0);
  
  // Convert back to UTC
  return new Date(nextReset.getTime() + offsetMs).toISOString();
}

function getCurrentPeriodStart(userTimezoneOffset = 0) {
  // Convert timezone offset from minutes to milliseconds
  const offsetMs = userTimezoneOffset * 60 * 1000;
  
  const now = new Date();
  const userLocalTime = new Date(now.getTime() - offsetMs);
  
  // Round down to the nearest RESET_INTERVAL
  const hoursToSubtract = userLocalTime.getHours() % RESET_INTERVAL;
  const periodStart = new Date(userLocalTime);
  periodStart.setHours(userLocalTime.getHours() - hoursToSubtract);
  periodStart.setMinutes(0, 0, 0);
  
  // Convert back to UTC
  return new Date(periodStart.getTime() + offsetMs).toISOString();
}

export async function GET(request) {
  try {
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userEmail = request.headers.get('x-user-email');
    const userTimezoneOffset = parseInt(request.headers.get('x-timezone-offset') || '0');
    
    const currentPeriodStart = getCurrentPeriodStart(userTimezoneOffset);
    const nextResetTime = getNextResetTime(userTimezoneOffset);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // First check if user is signed in and premium/trial
    if (userEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('is_trial, trial_end_date, subscription_status, subscription_type')
        .eq('email', userEmail)
        .single();

      const now = new Date();
      const isTrialActive = userData?.is_trial && 
        userData?.trial_end_date && 
        new Date(userData.trial_end_date) > now;

      // Check if user has premium access (either through trial or subscription)
      if (isTrialActive || userData?.subscription_status === 'active') {
        return NextResponse.json({ 
          isPremium: true,
          dailySwipes: 0,
          limitReached: false,
          timeRemaining: null,
          nextResetTime: null,
          isTrial: isTrialActive,
          ...(isTrialActive && {
            trialEndsAt: userData.trial_end_date
          })
        });
      }
    }

    // Anonymous user logic
    const { data: ipData } = await supabase
      .from('ip_usage')
      .select('*')
      .eq('ip_address', requestIP)
      .single();

    if (!ipData) {
      return NextResponse.json({ 
        dailySwipes: 0,
        limitReached: false,
        requiresSignIn: false,
        nextResetTime
      });
    }

    // Check if we need to reset based on last_reset vs currentPeriodStart
    const shouldReset = !ipData.last_reset || new Date(ipData.last_reset) < new Date(currentPeriodStart);

    if (shouldReset) {
      // New period, reset counts
      await supabase
        .from('ip_usage')
        .update({
          daily_usage: 0,
          last_reset: currentPeriodStart,
          next_reset: nextResetTime
        })
        .eq('ip_address', requestIP);

      return NextResponse.json({ 
        dailySwipes: 0,
        limitReached: false,
        requiresSignIn: false,
        nextResetTime
      });
    }

    const now = new Date();
    // If anonymous user hits limit, they need to sign in
    const limitReached = ipData.daily_usage >= ANONYMOUS_USAGE_LIMIT;
    const timeRemaining = limitReached ? 
      Math.ceil((new Date(nextResetTime).getTime() - now.getTime()) / 1000) : 
      null;
    
    return NextResponse.json({ 
      dailySwipes: ipData.daily_usage,
      limitReached,
      requiresSignIn: limitReached,
      timeRemaining,
      nextResetTime
    });

  } catch (error) {
    console.error('Error checking usage status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 