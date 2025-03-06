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

// Helper function to get PST/PDT date for comparison
function getPSTDate(date) {
  return new Date(date).toLocaleString("en-US", { timeZone: RESET_TIMEZONE }).split(',')[0];
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
  const today = getPSTDate(getCurrentPSTTime());

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
  const currentPSTDate = getPSTDate(getCurrentPSTTime());
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
    // 2. last_reset is from a previous day
    const shouldReset = !data?.last_reset || 
      getPSTDate(data.last_reset) !== currentPSTDate;

    if (shouldReset) {
      const { error: resetError } = await supabase
        .from(table)
        .update({
          daily_usage: 0,
          last_reset: currentPSTDate
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