import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ANONYMOUS_USAGE_LIMIT } from '@/app/constants';

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
          usage_count: 0,
          daily_usage: { date: today, count: 0 }
        } : {
          ip_address: identifier,
          usage_count: 0,
          last_used: new Date().toISOString()
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
    const { direction, userEmail } = await request.json();
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
      const currentCount = record?.usage_count || 0;
      const newCount = currentCount + 1;
      
      console.log('Debug - Usage counts:', {
        currentCount,
        newCount,
        timestamp: new Date().toISOString()
      });

      // Update the count in the appropriate table
      const table = isEmail ? 'users' : 'ip_usage';
      const idField = isEmail ? 'email' : 'ip_address';
      
      // Different update objects for users vs IP-based records
      const updateData = isEmail ? {
        usage_count: newCount,
        daily_usage: { date: new Date().toISOString().split('T')[0], count: newCount }
      } : {
        usage_count: newCount,
        last_used: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from(table)
        .update(updateData)
        .eq(idField, identifier);

      if (updateError) {
        console.error('Debug - Error updating usage count:', {
          error: updateError,
          table,
          idField,
          identifier
        });
        throw updateError;
      }

      const limitReached = !isEmail && newCount >= ANONYMOUS_USAGE_LIMIT;
      
      console.log('Debug - Successful swipe update:', {
        newCount,
        limitReached,
        timestamp: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        swipeCount: newCount,
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
    
    console.log('Debug - GET Swipe Count:', {
      ip: requestIP,
      userEmail,
      timestamp: new Date().toISOString()
    });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get or create usage record based on whether user is signed in
    const identifier = userEmail || requestIP;
    const isEmail = !!userEmail;
    const record = await getOrCreateUsageRecord(supabase, identifier, isEmail);
    const count = record.usage_count;
    const limitReached = !isEmail && count >= ANONYMOUS_USAGE_LIMIT;

    return NextResponse.json({ 
      swipeCount: count,
      limitReached
    });

  } catch (error) {
    console.error('Error fetching swipe count:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
} 