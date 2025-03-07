/**
 * Database Operations Utility
 * 
 * This file centralizes all database operations for user management and usage tracking.
 * 
 * Main Functions:
 * - User management (find/create/update)
 * - IP usage tracking
 * - Daily usage tracking
 * - Trial/Premium status management
 * 
 * Dependencies:
 * - @supabase/supabase-js: For database operations
 * 
 * Side Effects:
 * - Creates and updates records in users table
 * - Creates and updates records in ip_usage table
 * - Manages usage limits and trial periods
 * 
 * Connected Files:
 * - src/app/api/auth/google/route.js: User authentication
 * - src/app/api/swipes/route.js: Usage tracking
 * - src/app/api/usage/route.js: Usage status checks
 * - src/utils/usageTracking.js: Usage tracking utilities
 */

import { createClient } from '@supabase/supabase-js';
import { RESET_TIMEZONE } from './usageTracking';

// Helper function to get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Helper function to get current PST/PDT time
function getCurrentPSTTime() {
  return new Date().toLocaleString("en-US", { timeZone: RESET_TIMEZONE });
}

// New helper function to get PST/PDT timestamp for comparison
function getPSTTimestamp(date) {
  return new Date(new Date(date).toLocaleString("en-US", { timeZone: RESET_TIMEZONE })).getTime();
}

// Modified function to check if it's past reset time
function isPastResetTime(lastResetTime) {
  const now = new Date(getCurrentPSTTime());
  const lastReset = new Date(lastResetTime);
  
  // Get reset time (e.g., 12:00 AM PST)
  const resetHour = 0; // midnight
  const resetMinute = 0;
  
  // Create reset timestamp for comparison
  const today = new Date(now);
  today.setHours(resetHour, resetMinute, 0, 0);
  
  // If current time is before today's reset, use yesterday's reset time
  const resetTimestamp = now.getHours() < resetHour ? 
    today.getTime() - 24 * 60 * 60 * 1000 : 
    today.getTime();
    
  return getPSTTimestamp(lastResetTime) < resetTimestamp;
}

export async function getUserData(email) {
  const supabase = getSupabaseClient();
  
  await checkAndResetUsage(email, true);
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
  
  return data;
}

export async function getIPUsage(ip) {
  const supabase = getSupabaseClient();
  
  await checkAndResetUsage(ip, false);
  
  const { data, error } = await supabase
    .from('ip_usage')
    .select('*')
    .eq('ip_address', ip)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateIPUsage(ip, updateData) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('ip_usage')
    .update(updateData)
    .eq('ip_address', ip)
    .select();

  return { data, error };
}

export async function createIPUsage(data) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('ip_usage')
    .insert([data]);

  if (error) throw error;
}

export async function findOrCreateUser(email, name, picture, anonymousSwipes = 0) {
  const supabase = getSupabaseClient();
  try {
    // First try to find the existing user
    let { data: existingUser } = await supabase
      .from('users')
      .select(`
        id,
        email,
        name,
        picture,
        daily_usage,
        total_usage,
        subscription_status,
        is_trial,
        trial_end_date
      `)
      .eq('email', email)
      .single();

    if (existingUser) {
      // If user exists, add anonymous swipes to their daily usage
      const newDailyUsage = (existingUser.daily_usage || 0) + anonymousSwipes;
      const newTotalUsage = (existingUser.total_usage || 0) + anonymousSwipes;

      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          daily_usage: newDailyUsage,
          total_usage: newTotalUsage,
          last_used: new Date().toISOString()
        })
        .eq('email', email)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedUser;
    }

    // If user doesn't exist, create new user with anonymous swipes
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          email,
          name,
          picture,
          daily_usage: anonymousSwipes,
          total_usage: anonymousSwipes,
          last_used: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return newUser;

  } catch (error) {
    console.error('Error in findOrCreateUser:', error);
    throw error;
  }
}

export async function getDailyUsage(email) {
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('ip_usage')
    .select('total_usage')
    .eq('user_email', email)
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data.total_usage;
}

export async function resetDailyUsage(supabase, identifier, isEmail = false) {
  const table = isEmail ? 'users' : 'ip_usage';
  const idField = isEmail ? 'email' : 'ip_address';
  const today = getPSTTimestamp(getCurrentPSTTime());

  try {
    const { error } = await supabase
      .from(table)
      .update({
        daily_usage: 0,
        last_reset: today // Store just the date, not the full timestamp
      })
      .eq(idField, identifier);

    if (error) throw error;
  } catch (error) {
    console.error(`Error resetting daily usage for ${idField}:${identifier}:`, error);
    throw error;
  }
}

export async function checkAndResetUsage(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  const currentPSTTime = getCurrentPSTTime();
  const table = isEmail ? 'users' : 'ip_usage';
  const idField = isEmail ? 'email' : 'ip_address';
  
  try {
    const { data, error } = await supabase
      .from(table)
      .select('last_reset, daily_usage')
      .eq(idField, identifier)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // Only reset if:
    // 1. No last_reset exists, OR
    // 2. Current time is past the reset time since last reset
    const shouldReset = !data?.last_reset || 
      isPastResetTime(data.last_reset);

    if (shouldReset) {
      const { error: resetError } = await supabase
        .from(table)
        .update({
          daily_usage: 0,
          last_reset: currentPSTTime // Store full timestamp now
        })
        .eq(idField, identifier);

      if (resetError) throw resetError;
      return true; // Usage was reset
    }

    return false; // No reset needed
  } catch (error) {
    console.error('Error in checkAndResetUsage:', error);
    throw error;
  }
}

// Add this new function to centralize limit checking
export async function checkUsageLimits(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  
  try {
    // For signed-in users, check premium/trial status first
    if (isEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('daily_usage, subscription_status, is_trial, trial_end_date')
        .eq('email', identifier)
        .single();

      if (!userData) return { error: 'User not found' };

      const now = new Date();
      const isTrialActive = userData?.is_trial && 
        userData?.trial_end_date && 
        new Date(userData.trial_end_date) > now;

      // Premium/trial users have unlimited usage
      if (userData.subscription_status === 'active' || isTrialActive) {
        return {
          canSwipe: true,
          isPremium: userData.subscription_status === 'active',
          isTrial: isTrialActive,
          dailySwipes: userData.daily_usage || 0,
          ...(isTrialActive && { trialEndsAt: userData.trial_end_date })
        };
      }

      // Regular signed-in users
      return {
        canSwipe: (userData.daily_usage || 0) < FREE_USER_DAILY_LIMIT,
        isPremium: false,
        isTrial: false,
        dailySwipes: userData.daily_usage || 0,
        requiresUpgrade: (userData.daily_usage || 0) >= FREE_USER_DAILY_LIMIT
      };
    }

    // For anonymous users
    const { data: ipData } = await supabase
      .from('ip_usage')
      .select('daily_usage')
      .eq('ip_address', identifier)
      .single();

    return {
      canSwipe: !ipData || (ipData.daily_usage || 0) < ANONYMOUS_USAGE_LIMIT,
      isPremium: false,
      isTrial: false,
      dailySwipes: ipData?.daily_usage || 0,
      requiresSignIn: (ipData?.daily_usage || 0) >= ANONYMOUS_USAGE_LIMIT
    };

  } catch (error) {
    console.error('Error checking usage limits:', error);
    throw error;
  }
}

// Update the existing incrementUsage function
export async function incrementUsage(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  
  try {
    // Check limits first
    const limitCheck = await checkUsageLimits(identifier, isEmail);
    if (!limitCheck.canSwipe) {
      return limitCheck; // Return the limit check result
    }

    const now = new Date().toISOString();
    
    if (isEmail) {
      // Update user usage
      const { data, error } = await supabase
        .from('users')
        .update({
          daily_usage: (limitCheck.dailySwipes || 0) + 1,
          total_usage: supabase.raw('total_usage + 1'),
          last_used: now
        })
        .eq('email', identifier)
        .select()
        .single();

      if (error) throw error;
      return { ...limitCheck, dailySwipes: data.daily_usage };
    } else {
      // Update IP usage
      const { data, error } = await supabase
        .from('ip_usage')
        .upsert({
          ip_address: identifier,
          daily_usage: (limitCheck.dailySwipes || 0) + 1,
          total_usage: supabase.raw('COALESCE(total_usage, 0) + 1'),
          last_used: now
        })
        .select()
        .single();

      if (error) throw error;
      return { ...limitCheck, dailySwipes: data.daily_usage };
    }
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw error;
  }
} 