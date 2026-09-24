import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Matches saved_responses_user_response_created_at_key from
// supabase/migrations/20260924000000_create_saved_responses.sql — retried
// client saves and backfills collapse into a no-op instead of duplicates.
const INSERT_CONFLICT_TARGET = 'user_id,response,created_at';

// Client blobs (anonymous-save migration) carry the original save time.
// Anything missing or unparseable falls back to the server clock.
function toCreatedAt(value) {
  if (typeof value === 'string' && value && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

// Maps a client response payload to a saved_responses row. Bare strings are
// accepted for the bulk path (historical clients sent raw strings).
function toRow(userId, email, item) {
  const entry = typeof item === 'string' ? { response: item } : (item || {});
  return {
    user_id: userId,
    email,
    response: entry.response == null ? '' : String(entry.response),
    context: entry.context || null,
    last_message: entry.lastMessage || null,
    created_at: toCreatedAt(entry.created_at),
  };
}

// Resolves the owning users row — the FK tenant key for every write.
async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  return { data, error };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const userEmail = body.userEmail;

    if (!userEmail) {
      return NextResponse.json({ error: 'userEmail is required' }, { status: 400 });
    }

    const { data: user, error: userError } = await getUserByEmail(userEmail);
    if (userError) throw userError;

    let rows;
    if (Array.isArray(body.responses)) {
      // Bulk migration: skip malformed entries instead of failing the batch.
      rows = body.responses
        .map((item) => toRow(user.id, userEmail, item))
        .filter((row) => row.response);
    } else {
      if (!body.response || typeof body.response !== 'string') {
        return NextResponse.json({ error: 'response is required' }, { status: 400 });
      }
      rows = [toRow(user.id, userEmail, body)];
    }

    if (rows.length > 0) {
      // One INSERT per response; no read-modify-write, so concurrent saves
      // cannot clobber each other.
      const { error: insertError } = await supabase
        .from('saved_responses')
        .insert(rows, {
          onConflict: INSERT_CONFLICT_TARGET,
          ignoreDuplicates: true,
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving response:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const userEmail = request.headers.get('x-user-email');

    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('saved_responses')
      .select('id, response, context, last_message, created_at')
      .eq('email', userEmail)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Keep the JSON shape the client expects (lastMessage camelCase).
    const responses = (data || []).map(({ last_message, ...rest }) => ({
      ...rest,
      lastMessage: last_message,
    }));

    return NextResponse.json({ responses });
  } catch (error) {
    console.error('Error fetching saved responses:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('email');
    const timestamp = searchParams.get('timestamp');
    const id = searchParams.get('id');

    if (!userEmail || (!timestamp && !id)) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Deletes are always scoped to the caller's email. id wins over timestamp;
    // timestamp is kept so the current client (src/app/saved/page.js) keeps
    // working unchanged.
    let query = supabase.from('saved_responses').delete().eq('email', userEmail);
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('created_at', timestamp);
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting response:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
