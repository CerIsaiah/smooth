import { NextResponse } from 'next/server';
import { checkUsageStatus } from '@/utils/usageTracking';

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
    const requestIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const userEmail = request.headers.get('x-user-email');
    
    // Check if we have a valid email, otherwise use IP
    const identifier = userEmail || requestIP;
    const isEmail = Boolean(userEmail && userEmail.includes('@'));
    
    const usageStatus = await checkUsageStatus(identifier, isEmail);
    
    return NextResponse.json(usageStatus);
  } catch (error) {
    console.error('Error checking usage status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 