import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  PREMIUM_INCREMENT_PER_RESPONSE,
  FREE_INCREMENT_PER_RESPONSE,
  PREMIUM_MAX_PERCENTAGE,
  FREE_MAX_PERCENTAGE,
  MIN_LEARNING_PERCENTAGE
} from '../../constants';

function getSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  try {
    const userEmail = request.headers.get('x-user-email');
    const supabase = getSupabaseClient();
    
    if (!userEmail) {
      return NextResponse.json({ percentage: MIN_LEARNING_PERCENTAGE });
    }

    // First get the user's subscription status
    const { data: userData } = await supabase
      .from('users')
      .select('subscription_status, is_trial, trial_end_date')
      .eq('email', userEmail)
      .single();

    // Then get the saved responses for the user
    const { data, error } = await supabase
      .from('users')
      .select('saved_responses')
      .eq('email', userEmail)
      .single();

    if (error) {
      console.error('Error fetching saved responses:', error);
      return NextResponse.json({ percentage: MIN_LEARNING_PERCENTAGE });
    }

    // Count the saved responses array length
    const savedResponsesCount = data?.saved_responses?.length ?? 0;

    // Check if user has active premium features
    const now = new Date();
    const hasActiveSubscription = 
      userData?.subscription_status === 'active' || 
      (userData?.is_trial && userData?.trial_end_date && new Date(userData.trial_end_date) > now);

    // Calculate percentage based solely on number of saved responses
    const incrementPerResponse = hasActiveSubscription ? PREMIUM_INCREMENT_PER_RESPONSE : FREE_INCREMENT_PER_RESPONSE;
    const maxPercentage = hasActiveSubscription ? PREMIUM_MAX_PERCENTAGE : FREE_MAX_PERCENTAGE;
    
    console.log('Debug info:', {
      savedResponsesCount,
      incrementPerResponse,
      maxPercentage,
      calculatedPercentage: savedResponsesCount * incrementPerResponse
    });

    const percentage = Math.min(
      savedResponsesCount * incrementPerResponse,
      maxPercentage
    );

    return NextResponse.json({ 
      percentage: Math.max(percentage, MIN_LEARNING_PERCENTAGE),
      savedResponsesCount,
      debug: {
        increment: incrementPerResponse,
        max: maxPercentage,
        calculated: savedResponsesCount * incrementPerResponse,
        final: percentage
      }
    });

  } catch (error) {
    console.error('Error in learning-percentage route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 