import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT, FREE_USER_DAILY_LIMIT } from '@/app/constants';

async function getOrCreateUsageRecord(supabase, identifier, isEmail = false) {
  console.log('Debug - Getting usage record for:', identifier);
  
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
        console.log('Debug - Creating new usage record for:', identifier);
        
        const today = new Date().toISOString().split('T')[0];
        const newRecord = isEmail ? {
          email: identifier,
          total_usage: 0,
          daily_usage: 0,
          last_used: new Date().toISOString(),
          last_reset: today,
          login_count: 0
        } : {
          ip_address: identifier,
          total_usage: 0,
          daily_usage: 0,
          last_used: new Date().toISOString(),
          last_reset: today,
          login_count: 0
        };
        
        const { data: newData, error: insertError } = await supabase
          .from(table)
          .insert([newRecord])
          .select()
          .single();

        if (insertError) {
          console.error('Debug - Error creating usage record:', insertError);
          throw insertError;
        }
        
        return newData;
      }
      
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Debug - Unexpected error in getOrCreateUsageRecord:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const { direction, userEmail, isNewSession } = await request.json();
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    console.log('Debug - POST Swipe Request:', {
      ip: requestIP,
      userEmail,
      direction,
      timestamp: new Date().toISOString()
    });

    if (!direction) {
      console.error('Debug - Missing direction in request');
      return NextResponse.json({ 
        error: 'Direction is required' 
      }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!supabase) {
      console.error('Debug - Failed to create Supabase client');
      return NextResponse.json({ 
        error: 'Database connection failed' 
      }, { status: 500 });
    }

    // Get current record based on whether user is signed in
    const identifier = userEmail || requestIP;
    const isEmail = !!userEmail;

    console.log('Debug - Getting record for:', {
      identifier,
      isEmail,
      timestamp: new Date().toISOString()
    });

    try {
      const record = await getOrCreateUsageRecord(supabase, identifier, isEmail);
      const today = new Date().toISOString().split('T')[0];
      
      // Add these lines to define table and idField
      const table = isEmail ? 'users' : 'ip_usage';
      const idField = isEmail ? 'email' : 'ip_address';
      
      // Reset daily usage if it's a new day
      const shouldResetDaily = record.last_reset !== today;
      const newDailyCount = shouldResetDaily ? 1 : (record.daily_usage + 1);
      const newTotalCount = record.total_usage + 1;
      
      console.log('Debug - Usage counts:', {
        currentDailyCount: record.daily_usage,
        newDailyCount,
        currentTotalCount: record.total_usage,
        newTotalCount,
        shouldResetDaily,
        timestamp: new Date().toISOString()
      });

      // Update usage data
      const updateData = {
        daily_usage: newDailyCount,
        total_usage: newTotalCount,
        last_used: new Date().toISOString(),
        last_reset: shouldResetDaily ? today : record.last_reset
      };

      // Increment login count for anonymous users on new sessions
      if (!isEmail && isNewSession) {
        updateData.login_count = (record.login_count || 0) + 1;
      }

      const { error: updateError } = await supabase
        .from(table)
        .update(updateData)
        .eq(idField, identifier);

      // Add this logging
      console.log('Debug - Update operation:', {
        table,
        idField,
        identifier,
        updateData,
        error: updateError,
        timestamp: new Date().toISOString()
      });

      if (updateError) {
        console.error('Debug - Error updating usage count:', {
          error: updateError,
          table,
          idField,
          identifier
        });
        throw updateError;
      }

      const limitReached = isEmail 
        ? newDailyCount >= FREE_USER_DAILY_LIMIT 
        : newDailyCount >= ANONYMOUS_USAGE_LIMIT;
      
      console.log('Debug - Successful swipe update:', {
        newDailyCount,
        newTotalCount,
        limitReached,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        dailySwipes: newDailyCount,
        totalSwipes: newTotalCount,
        limitReached
      });

    } catch (dbError) {
      console.error('Debug - Database operation failed:', dbError);
      return NextResponse.json({ 
        error: 'Database operation failed',
        details: dbError.message 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Debug - Error in POST /api/swipes:', {
      error,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
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

    // Only look up existing records, don't create new ones
    const table = userEmail ? 'users' : 'ip_usage';
    const idField = userEmail ? 'email' : 'ip_address';
    const identifier = userEmail || requestIP;
    
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(idField, identifier)
      .single();

    if (error) {
      // If no record exists, return 0 counts instead of creating a record
      return NextResponse.json({ 
        dailySwipes: 0,
        totalSwipes: 0,
        limitReached: false
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const dailySwipes = data.last_reset !== today ? 0 : data.daily_usage;
    const dailyLimit = userEmail ? FREE_USER_DAILY_LIMIT : ANONYMOUS_USAGE_LIMIT;
    const limitReached = dailySwipes >= dailyLimit;

    return NextResponse.json({ 
      dailySwipes,
      totalSwipes: data.total_usage,
      limitReached
    });

  } catch (error) {
    console.error('Error fetching swipe count:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
} 