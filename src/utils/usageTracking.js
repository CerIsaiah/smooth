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
    
    if (userEmail) {
      // Get user data with built-in timeout from dbOperations
      const userData = await getUserData(userEmail);
      
      if (!userData) throw new Error('No user data found');

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

    // For anonymous users - use getIPUsage with built-in timeout
    const ipData = await getIPUsage(requestIP);

    return {
      isPremium: false,
      isTrial: false,
      limitReached: (ipData?.daily_usage || 0) >= ANONYMOUS_USAGE_LIMIT,
      dailySwipes: ipData?.daily_usage || 0
    };

  } catch (error) {
    console.error('Error in checkUsageStatus:', error);
    
    if (error.message.includes('timed out')) {
      throw new Error('Request timed out while checking usage limits');
    }
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

      // Update or initialize today's usage in the history
      const dailyUsageHistory = userData.daily_usage_history || {};
      dailyUsageHistory[today] = (dailyUsageHistory[today] || 0) + 1;

      const newDailyUsage = (userData.daily_usage || 0) + 1;
      const newTotalUsage = (userData.total_usage || 0) + 1;

      // Update user's usage counts
      const { error: updateError } = await supabase
        .from('users')
        .update({
          daily_usage: newDailyUsage,
          total_usage: newTotalUsage,
          last_used: now.toISOString(),
          daily_usage_history: dailyUsageHistory
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      return {
        dailySwipes: newDailyUsage,
        totalUsage: newTotalUsage,
        isPremium: userData.subscription_status === 'active',
        isTrial: userData.is_trial,
        dailyUsageHistory
      };
    } else {
      // Get existing IP record first
      const { data: existingData, error: getError } = await supabase
        .from('ip_usage')
        .select('*')
        .eq('ip_address', requestIP)
        .single();

      if (getError && getError.code !== 'PGRST116') { // Not found error
        throw getError;
      }

      if (existingData) {
        // Update existing record
        const newDailyUsage = (existingData.daily_usage || 0) + 1;
        const newTotalUsage = (existingData.total_usage || 0) + 1;

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
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('ip_usage')
          .insert({
            ip_address: requestIP,
            daily_usage: 1,
            total_usage: 1,
            last_used: now.toISOString(),
            last_reset: today
          });

        if (insertError) throw insertError;

        return {
          dailySwipes: 1,
          totalUsage: 1,
          isPremium: false,
          isTrial: false
        };
      }
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

/**
 * Converts a File object to a base64 string
 * @param {File} file - The file to convert
 * @returns {Promise<string>} A promise that resolves with the base64 string
 */
export function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
} 