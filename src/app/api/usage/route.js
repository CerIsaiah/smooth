import { NextResponse } from 'next/server';
import { checkUsageStatus } from '@/utils/usageTracking';
import { checkAndResetUsage, checkUsageLimits } from '@/utils/dbOperations';
import { resolveIdentity } from '@/utils/auth';

/**
 * Usage API Route
 * 
 * This file handles checking and managing user usage limits.
 * 
 * Main Features:
 * - Tracks anonymous and authenticated usage
 * - Checks premium/trial status
 * - Enforces usage limits
 * 
 * Dependencies:
 * - @/utils/usageTracking: For usage management
 * 
 * Side Effects:
 * - Logs usage checks for debugging
 * 
 * Connected Files:
 * - src/utils/usageTracking.js: Usage tracking logic
 * - src/app/page.js: Checks usage before generation
 * - src/app/responses/page.js: Checks usage limits
 */

export async function GET(request) {
  try {
    // Identity: verified session email, else the request IP (anonymous path).
    const identity = resolveIdentity(request);
    const identifier = identity.email || identity.ip;
    const isEmail = identity.isSignedIn;
    
    // First check if we need to reset
    const wasReset = await checkAndResetUsage(identifier, isEmail);
    console.log('Usage check reset status:', { identifier, wasReset });
    
    // Then get the current usage status (which will now reflect any reset)
    const usageStatus = await checkUsageStatus(identifier, isEmail, identity.name, identity.picture);
    
    return NextResponse.json({
      ...usageStatus,
      wasReset
    });
  } catch (error) {
    console.error('Error checking usage status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 