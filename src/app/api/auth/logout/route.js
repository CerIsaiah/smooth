/**
 * Sign-out endpoint: expires the httpOnly session cookie so subsequent
 * requests fall back to the anonymous (IP-based) usage path.
 */

import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/utils/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
