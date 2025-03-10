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
import { 
  ANONYMOUS_USAGE_LIMIT, 
  FREE_USER_DAILY_LIMIT,
  SIGNED_IN_USAGE_LIMIT 
} from '@/app/constants';

// Modify the getSupabaseClient function to cache the client
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseClient;
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
  console.time('getUserData');
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timed out')), 5000);
    });

    const dbPromise = getSupabaseClient()
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    const { data, error } = await Promise.race([
      dbPromise,
      timeoutPromise
    ]);
    
    console.timeEnd('getUserData');
    
    if (error) {
      console.error('Supabase getUserData error:', error);
      throw error;
    }

    await checkAndResetUsage(email, true);
    
    return data;
  } catch (error) {
    console.error('getUserData failed:', error);
    throw error;
  }
}

export async function getIPUsage(ip) {
  console.time('getIPUsage');
  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timed out')), 5000);
    });

    // Create the actual database query
    const dbPromise = getSupabaseClient()
      .from('ip_usage')
      .select('*')
      .eq('ip_address', ip)
      .single();

    // Race between timeout and database query
    const { data, error } = await Promise.race([
      dbPromise,
      timeoutPromise
    ]);

    console.timeEnd('getIPUsage');

    if (error && error.code !== 'PGRST116') { // Not found error is ok
      console.error('Supabase getIPUsage error:', error);
      throw error;
    }

    await checkAndResetUsage(ip, false);
    
    return data || { ip_address: ip, daily_usage: 0, total_usage: 0 };
  } catch (error) {
    console.error('getIPUsage failed:', error);
    throw error;
  }
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
  const today = new Date(currentPSTTime).toISOString().split('T')[0]; // Just the date portion
  const table = isEmail ? 'users' : 'ip_usage';
  const idField = isEmail ? 'email' : 'ip_address';
  
  try {
    if (!isEmail) {
      // For IP addresses, use upsert pattern to avoid race conditions
      const { data, error } = await supabase
        .from(table)
        .upsert({
          [idField]: identifier,
          daily_usage: 0, // Will be overridden if record exists and doesn't need reset
          total_usage: 0, // Will be overridden if record exists
          last_reset: today
        }, {
          onConflict: idField,
          // Don't update fields if the record already exists, we'll do that after checking reset
          ignoreDuplicates: true
        });
      
      if (error) throw error;
    }
    
    // Now get the most current record
    const { data: record, error: getError } = await supabase
      .from(table)
      .select('last_reset, daily_usage, total_usage')
      .eq(idField, identifier)
      .single();
    
    if (getError) {
      if (getError.code === 'PGRST116' && !isEmail) {
        // This should not happen since we just upserted, but handle it anyway
        return true;
      }
      throw getError;
    }
    
    // Check if reset is needed
    const shouldReset = !record?.last_reset || isPastResetTime(record.last_reset);
    
    if (shouldReset) {
      const { error: resetError } = await supabase
        .from(table)
        .update({
          daily_usage: 0,
          last_reset: today
        })
        .eq(idField, identifier);
      
      if (resetError) throw resetError;
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error in checkAndResetUsage:', error);
    throw error;
  }
}

// Update checkUsageLimits to use the imported constants
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

// Update incrementUsage to handle race conditions better
export async function incrementUsage(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  
  try {
    // Check and reset usage first
    await checkAndResetUsage(identifier, isEmail);
    
    // Then check limits
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
      // For IP addresses, use RLS-safe update - get, then update approach
      let currentData;
      
      // First, get the latest data
      const { data: ipData, error: getError } = await supabase
        .from('ip_usage')
        .select('daily_usage, total_usage')
        .eq('ip_address', identifier)
        .single();
        
      if (getError) {
        if (getError.code === 'PGRST116') {
          // Record doesn't exist, create it with upsert
          const { data, error } = await supabase
            .from('ip_usage')
            .upsert({
              ip_address: identifier,
              daily_usage: 1,
              total_usage: 1,
              last_used: now,
              last_reset: new Date(getCurrentPSTTime()).toISOString().split('T')[0]
            })
            .select();
            
          if (error) throw error;
          return { ...limitCheck, dailySwipes: 1 };
        }
        throw getError;
      }
      
      // Record exists, update it
      const newDailyUsage = (ipData.daily_usage || 0) + 1;
      const newTotalUsage = (ipData.total_usage || 0) + 1;
      
      const { error: updateError } = await supabase
        .from('ip_usage')
        .update({
          daily_usage: newDailyUsage,
          total_usage: newTotalUsage,
          last_used: now
        })
        .eq('ip_address', identifier);
        
      if (updateError) throw updateError;
      return { ...limitCheck, dailySwipes: newDailyUsage };
    }
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw error;
  }
} 