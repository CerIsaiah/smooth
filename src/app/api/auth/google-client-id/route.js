export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return Response.json({ error: 'Google Client ID not configured' }, { status: 500 });
  }
  
  return Response.json({ 
    clientId: process.env.GOOGLE_CLIENT_ID 
  });
} 