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
 * - src/utils/resetWindow.js: UTC reset-boundary helpers
 * - supabase/migrations/*_atomic_usage_tracking.sql: atomic RPCs used below
 *
 * Counting contract: every usage counter write goes through a Supabase RPC
 * that locks the row and decides under the lock — there are no
 * read-then-write counter updates in application code. One swipe = exactly
 * one increment (generation in /api/openai never increments).
 */

import { createClient } from '@supabase/supabase-js';
import { getNextUtcMidnight } from './resetWindow';
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

export async function getUserData(email) {
  console.time('getUserData');
  try {
    if (!email) {
      console.error('No email provided to getUserData');
      throw new Error('Email is required');
    }
    
    console.log('Querying user with email:', email);
    
    const supabase = getSupabaseClient();
    const now = new Date();
    const today = now.toISOString(); // Store full ISO string instead of just date portion
    const nextReset = getNextUtcMidnight(now).toISOString(); // Next 00:00 UTC
    
    // First, try to get the user
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.trim().toLowerCase()) // Normalize email
      .maybeSingle();
      
    if (error) {
      console.error('Database error in getUserData:', error);
      throw error;
    }
    
    if (!data) {
      console.log('No user found, creating new user record for:', email);
      // Create new user with all required fields
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: email.trim().toLowerCase(),
          created_at: now,
          daily_usage: 0,
          saved_responses: [],
          total_usage: 0,
          last_used: now,
          last_reset: now,
          subscription_type: 'standard',
          subscription_status: 'inactive',
          subscription_updated_at: now,
          is_trial: false,
          trial_end_date: null,
          trial_started_at: null,
          subscription_end_date: null,
          trial_ending_soon: false,
          stripe_customer_id: null,
          cancel_at_period_end: false
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating new user:', createError);
        throw createError;
      }
      
      console.log('New user created:', newUser);
      return newUser;
    }
    
    console.log('Found existing user:', data);
    return data;
    
  } catch (error) {
    console.error('getUserData failed:', error);
    throw error;
  } finally {
    console.timeEnd('getUserData');
  }
}

export async function getIPUsage(ip) {
  console.time('getIPUsage');
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timed out')), 5000);
    });

    const dbPromise = getSupabaseClient()
      .from('ip_usage')
      .select('*')
      .eq('ip_address', ip)
      .single();

    const { data, error } = await Promise.race([
      dbPromise,
      timeoutPromise
    ]);

    console.timeEnd('getIPUsage');

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase getIPUsage error:', error);
      throw error;
    }
    
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
      if (anonymousSwipes > 0) {
        // Merge the anonymous device's swipes into the account atomically —
        // the old read-then-write update could clobber a concurrent swipe
        // increment. Empty result means the row vanished since the read;
        // fall through to the insert below to recreate it.
        const { data: mergedRows, error: mergeError } = await supabase
          .rpc('merge_anonymous_usage', {
            p_email: email,
            p_anonymous_swipes: anonymousSwipes,
          });

        if (mergeError) throw mergeError;

        const mergedUser = Array.isArray(mergedRows) ? mergedRows[0] : mergedRows;
        if (mergedUser) return mergedUser;
      } else {
        // Nothing to merge: refresh last_used only. A single-column write
        // cannot clobber the counters the way the old +0 counter rewrite did.
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ last_used: new Date().toISOString() })
          .eq('email', email)
          .select()
          .single();

        if (updateError) throw updateError;
        return updatedUser;
      }
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
  return data?.total_usage ?? 0;  // no row for this email/day yet
}

export async function checkAndResetUsage(identifier, isEmail) {
  // Anonymous (IP) counters reset inside increment_ip_usage at UTC rollover;
  // there is no read-side reset for IPs (same as before).
  if (!isEmail) return false;

  console.log(`Checking reset for email: ${identifier}`);
  const supabase = getSupabaseClient();

  try {
    // Atomic reset: the RPC locks the row, archives yesterday's final count
    // into daily_usage_history and zeroes daily_usage when the UTC day has
    // rolled over. Returns whether a reset happened.
    const { data, error } = await supabase.rpc('reset_user_usage_if_stale', {
      p_email: identifier,
    });

    if (error) throw error;

    const wasReset = Array.isArray(data) ? data[0] : data;
    if (wasReset) {
      console.log('Daily usage reset for:', identifier);
    }
    return Boolean(wasReset);
  } catch (error) {
    console.error('Error in checkAndResetUsage:', error);
    throw error;
  }
}

// Update checkUsageLimits to handle the identifier correctly
export async function checkUsageLimits(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  // Reset boundaries are UTC (see src/utils/resetWindow.js) — the same
  // convention the RPCs enforce server-side.
  const nextResetTime = getNextUtcMidnight().toISOString();
  
  try {
    console.log('Checking usage limits for:', { identifier, isEmail });
    
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
          nextResetTime,
          ...(isTrialActive && { trialEndsAt: userData.trial_end_date })
        };
      }

      // Regular signed-in users
      return {
        canSwipe: (userData.daily_usage || 0) < FREE_USER_DAILY_LIMIT,
        isPremium: false,
        isTrial: false,
        dailySwipes: userData.daily_usage || 0,
        nextResetTime,
        requiresUpgrade: (userData.daily_usage || 0) >= FREE_USER_DAILY_LIMIT
      };
    }

    // For anonymous users, use IP tracking
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
      nextResetTime,
      requiresSignIn: (ipData?.daily_usage || 0) >= ANONYMOUS_USAGE_LIMIT
    };

  } catch (error) {
    console.error('Error checking usage limits:', error);
    throw error;
  }
}

// Atomic usage increment. All counter decisions happen inside a Supabase
// RPC that locks the row, resets at UTC rollover and enforces the limit
// server-side — concurrent requests can no longer undercount or bypass the
// limit by racing the old read-then-write window.
export async function incrementUsage(identifier, isEmail = false) {
  const supabase = getSupabaseClient();
  
  try {
    if (isEmail) {
      const { data, error } = await supabase.rpc('increment_user_usage', {
        p_email: identifier,
        p_daily_limit: FREE_USER_DAILY_LIMIT,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return { error: 'User not found' };

      return {
        // The RPC's limit decision is authoritative (premium/active trial
        // users are unlimited inside the RPC, matching checkUsageLimits).
        canSwipe: row.incremented !== false,
        isPremium: Boolean(row.is_premium),
        isTrial: Boolean(row.is_trial),
        dailySwipes: row.daily_usage ?? 0,
        wasReset: Boolean(row.was_reset),
      };
    }

    const { data, error } = await supabase.rpc('increment_ip_usage', {
      p_ip: identifier,
      p_daily_limit: ANONYMOUS_USAGE_LIMIT,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;

    return {
      canSwipe: row.incremented !== false,
      isPremium: false,
      isTrial: false,
      dailySwipes: row.daily_usage ?? 0,
      wasReset: Boolean(row.was_reset),
    };
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw error;
  }
}