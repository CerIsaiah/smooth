import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";
import { requireSession } from '@/utils/auth';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Identity comes from the verified session cookie — never from the body.
    const { session, error: authError } = requireSession(request);
    if (authError) return authError;
    const userEmail = session.email;

    const body = await request.json();
    
    // Handle both single response and bulk responses
    if (Array.isArray(body.responses)) {
      // Bulk migration of responses
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('saved_responses, daily_usage')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;

      // Combine existing responses with new ones
      const existingResponses = userData.saved_responses || [];
      const newResponses = [...body.responses, ...existingResponses];

      const { error: updateError } = await supabase
        .from('users')
        .update({ saved_responses: newResponses })
        .eq('email', userEmail);

      if (updateError) throw updateError;
    } else {
      // Single response
      const { response, context, lastMessage } = body;
      
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('saved_responses, daily_usage')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;

      // Create new response object
      const newResponse = {
        response,
        context: context || null,
        lastMessage: lastMessage || null,
        created_at: new Date().toISOString(),
      };

      // Combine existing responses with new one
      const savedResponses = userData.saved_responses || [];
      savedResponses.unshift(newResponse); // Add to beginning of array

      // Update the user's saved_responses array
      const { error: updateError } = await supabase
        .from('users')
        .update({ saved_responses: savedResponses })
        .eq('email', userEmail);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving response:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    // Identity comes from the verified session cookie — never from a header.
    const { session, error: authError } = requireSession(request);
    if (authError) return authError;
    const userEmail = session.email;

    const { data, error } = await supabase
      .from('users')
      .select('saved_responses')
      .eq('email', userEmail)
      .single();

    if (error) throw error;

    return NextResponse.json({ responses: data.saved_responses || [] });
  } catch (error) {
    console.error('Error fetching saved responses:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    // Identity comes from the verified session cookie — never a query param.
    const { session, error: authError } = requireSession(request);
    if (authError) return authError;
    const userEmail = session.email;

    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    if (!timestamp) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get current saved responses
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('saved_responses')
      .eq('email', userEmail)
      .single();

    if (fetchError) throw fetchError;

    // Filter out the response with matching timestamp
    const updatedResponses = (userData.saved_responses || []).filter(
      response => response.created_at !== timestamp
    );

    // Update the user's saved_responses array
    const { error: updateError } = await supabase
      .from('users')
      .update({ saved_responses: updatedResponses })
      .eq('email', userEmail);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting response:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}