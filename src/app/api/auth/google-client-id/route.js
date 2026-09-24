import { NextResponse } from 'next/server';

export async function GET() {
  // Use the server-side environment variable
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  console.log('Debug - Google Client ID Check:', {
    exists: !!clientId,
    timestamp: new Date().toISOString()
  });

  if (!clientId) {
    // Intentionally minimal: never echo env var names back to the client.
    return NextResponse.json({
      error: 'Google Client ID not configured'
    }, { status: 500 });
  }
  
  return NextResponse.json({ clientId });
} 