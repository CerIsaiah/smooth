import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT } from '@/app/constants';

async function getOrCreateUsageRecord(supabase, identifier, isEmail = false) {
  const table = isEmail ? 'users' : 'ip_usage';
  const idField = isEmail ? 'email' : 'ip_address';
  
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(idField, identifier)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        const today = new Date().toISOString().split('T')[0];
        const newRecord = {
          [idField]: identifier,
          total_usage: 0,
          daily_usage: 0,
          last_used: new Date().toISOString(),
          last_reset: today,
          ...(isEmail && { 
            is_premium: false,
            is_trial: false,
            trial_end_date: null,
            trial_started_at: null
          })
        };
        
        const { data: newData, error: insertError } = await supabase
          .from(table)
          .insert([newRecord])
          .select()
          .single();

        if (insertError) throw insertError;
        return newData;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getOrCreateUsageRecord:', error);
    throw error;
  }
}

function getNextResetTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

export async function POST(request) {
  try {
    const { direction, userEmail } = await request.json();
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    console.log('📝 Processing swipe request:', { userEmail, requestIP });

    if (!direction) {
      return NextResponse.json({ error: 'Direction is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // If user is signed in, check premium/trial status first
    if (userEmail) {
      console.log('🔍 Checking user status for:', userEmail);
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('is_premium, is_trial, trial_end_date, subscription_status')
        .eq('email', userEmail)
        .single();

      if (userError) {
        console.error('❌ Error fetching user data:', userError);
      } else {
        console.log('👤 User data:', userData);
      }

      const now = new Date();
      const isTrialActive = userData?.is_trial && 
        userData?.trial_end_date && 
        new Date(userData.trial_end_date) > now;

      console.log('✨ Premium status check:', {
        isPremium: userData?.is_premium,
        isTrialActive,
        subscriptionStatus: userData?.subscription_status
      });

      // Give trial users the same benefits as premium users
      if (userData?.is_premium || isTrialActive || userData?.subscription_status === 'active') {
        console.log('🌟 Premium/Trial user detected - not counting swipes');
        return NextResponse.json({
          success: true,
          isPremium: true,
          dailySwipes: 0,
          isTrial: isTrialActive,
          limitReached: false,
          ...(isTrialActive && {
            trialEndsAt: userData.trial_end_date
          })
        });
      }
    }

    // Only proceed with usage tracking for non-premium users
    console.log('📊 Tracking usage for non-premium user');

    // Get both anonymous and user records if available
    const ipRecord = await getOrCreateUsageRecord(supabase, requestIP, false);
    const userRecord = userEmail ? await getOrCreateUsageRecord(supabase, userEmail, true) : null;
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Reset counts if it's a new day
    const shouldReset = ipRecord.last_reset !== today;
    
    // Calculate total daily usage (anonymous + signed in)
    const totalDailyUsage = shouldReset ? 1 : (
      (ipRecord.last_reset === today ? ipRecord.daily_usage : 0) +
      (userRecord?.last_reset === today ? userRecord.daily_usage : 0)
    );

    console.log('📈 Usage stats:', {
      shouldReset,
      totalDailyUsage,
      ipUsage: ipRecord.daily_usage,
      userUsage: userRecord?.daily_usage
    });

    // Check if combined usage exceeds limit
    if (totalDailyUsage >= ANONYMOUS_USAGE_LIMIT) {
      console.log('⚠️ Usage limit reached');
      if (!userEmail) {
        // Anonymous user needs to sign in
        return NextResponse.json({
          success: false,
          requiresSignIn: true,
          limitReached: true,
          dailySwipes: totalDailyUsage,
          nextResetTime: getNextResetTime()
        });
      } else {
        // Signed in user needs to upgrade
        const nextReset = getNextResetTime();
        return NextResponse.json({
          success: false,
          requiresUpgrade: true,
          limitReached: true,
          dailySwipes: totalDailyUsage,
          nextResetTime: nextReset,
          timeRemaining: Math.ceil((new Date(nextReset).getTime() - now.getTime()) / 1000)
        });
      }
    }

    // Only update usage records for non-premium users
    console.log('✏️ Updating usage records');
    const updateData = {
      daily_usage: shouldReset ? 1 : ipRecord.daily_usage + 1,
      total_usage: ipRecord.total_usage + 1,
      last_used: now.toISOString(),
      last_reset: today
    };

    await supabase
      .from('ip_usage')
      .update(updateData)
      .eq('ip_address', requestIP);

    if (userEmail) {
      await supabase
        .from('users')
        .update(updateData)
        .eq('email', userEmail);
    }

    console.log('✅ Successfully processed swipe');
    return NextResponse.json({
      success: true,
      dailySwipes: totalDailyUsage + 1,
      limitReached: false,
      nextResetTime: getNextResetTime()
    });

  } catch (error) {
    console.error('❌ Error in POST /api/swipes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

    const nextResetTime = getNextResetTime();

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