/**
 * Usage Tracking Utilities
 * 
 * This file provides centralized usage tracking and management functions.
 * 
 * Main Features:
 * - Usage status checking
 * - Premium/trial status verification
 * - Usage limit enforcement
 * 
 * Dependencies:
 * - @supabase/supabase-js: For database operations
 * - @/app/constants: For usage limits
 * 
 * Side Effects:
 * - Updates usage records in database
 * - Manages daily usage resets
 * 
 * Connected Files:
 * - src/app/api/usage/route.js: Uses these utilities
 * - src/app/api/swipes/route.js: Tracks swipe usage
 * - src/utils/dbOperations.js: Database operations
 */

import { createClient } from '@supabase/supabase-js';
import { ANONYMOUS_USAGE_LIMIT, FREE_USER_DAILY_LIMIT } from '@/app/constants';
import { getUserData, getIPUsage } from './dbOperations';

export async function checkUsageStatus(requestIP, userEmail) {
  try {
    console.log('Checking usage for:', { requestIP, userEmail });
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // For signed-in users, prioritize their user data
    if (userEmail) {
      // Get user data first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (userError) throw userError;


      const now = new Date();
      const isTrialActive = userData?.is_trial && 
        userData?.trial_end_date && 
        new Date(userData.trial_end_date) > now;

      // Premium/trial users have unlimited usage
      if (isTrialActive || userData?.subscription_status === 'active') {
        return { 
          isPremium: userData?.subscription_status === 'active',
          isTrial: isTrialActive,
          limitReached: false,
          dailySwipes: userData?.daily_usage || 0,
          ...(isTrialActive && {
            trialEndsAt: userData.trial_end_date
          })
        };
      }

      // Regular signed-in users - use their daily_usage
      return {
        isPremium: false,
        isTrial: false,
        limitReached: (userData?.daily_usage || 0) >= FREE_USER_DAILY_LIMIT,
        dailySwipes: userData?.daily_usage || 0
      };
    }

    // For anonymous users, check IP usage
    const { data: ipData, error: ipError } = await supabase
      .from('ip_usage')
      .select('*')
      .eq('ip_address', requestIP)
      .single();

    if (ipError && ipError.code !== 'PGRST116') throw ipError;
    console.log('IP usage data:', ipData);

    // For anonymous users, only check against ANONYMOUS_USAGE_LIMIT
    const limitReached = (ipData?.daily_usage || 0) >= ANONYMOUS_USAGE_LIMIT;
    return {
      isPremium: false,
      isTrial: false,
      limitReached,
      dailySwipes: ipData?.daily_usage || 0
    };

  } catch (error) {
    console.error('Error in checkUsageStatus:', error);
    throw error;
  }
}

export async function incrementUsage(requestIP, userEmail = null) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    if (userEmail) {
      // Get user data first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (userError) throw userError;

      // If no user data found, return early
      if (!userData) {
        console.error('No user data found for email:', userEmail);
        return {
          dailySwipes: 0,
          isPremium: false,
          isTrial: false
        };
      }

      const newDailyUsage = (userData.daily_usage || 0) + 1;
      const newTotalUsage = (userData.total_usage || 0) + 1;

      // Update user's usage counts
      const { error: updateError } = await supabase
        .from('users')
        .update({
          daily_usage: newDailyUsage,
          total_usage: newTotalUsage,
          last_used: now.toISOString()
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      return {
        dailySwipes: newDailyUsage,
        totalUsage: newTotalUsage,
        isPremium: userData.subscription_status === 'active',
        isTrial: userData.is_trial
      };
    } else {
      // Handle anonymous users with IP tracking
      const { data: ipData, error: ipError } = await supabase
        .from('ip_usage')
        .select('*')
        .eq('ip_address', requestIP)
        .single();

      if (ipError && ipError.code !== 'PGRST116') throw ipError;

      if (!ipData) {
        // Create new record for IP
        const { data, error: insertError } = await supabase
          .from('ip_usage')
          .insert([{
            ip_address: requestIP,
            daily_usage: 1,
            total_usage: 1,
            last_used: now.toISOString(),
            last_reset: today
          }])
          .select()
          .single();

        if (insertError) throw insertError;

        return {
          dailySwipes: 1,
          totalUsage: 1,
          isPremium: false,
          isTrial: false
        };
      }

      // Update existing IP record
      const newDailyUsage = (ipData.daily_usage || 0) + 1;
      const newTotalUsage = (ipData.total_usage || 0) + 1;

      const { error: updateError } = await supabase
        .from('ip_usage')
        .update({
          daily_usage: newDailyUsage,
          total_usage: newTotalUsage,
          last_used: now.toISOString()
        })
        .eq('ip_address', requestIP);

      if (updateError) throw updateError;

      return {
        dailySwipes: newDailyUsage,
        totalUsage: newTotalUsage,
        isPremium: false,
        isTrial: false
      };
    }
  } catch (error) {
    console.error('Error in incrementUsage:', error);
    throw error;
  }
}

export const RESET_TIMEZONE = 'America/Los_Angeles';

export function getNextResetTime() {
  const now = new Date();
  const pstDate = new Date(now.toLocaleString('en-US', { timeZone: RESET_TIMEZONE }));
  const tomorrow = new Date(pstDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

export function getFormattedTimeUntilReset() {
  const now = new Date();
  const nextReset = getNextResetTime();
  const diffMs = nextReset - now;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
} 