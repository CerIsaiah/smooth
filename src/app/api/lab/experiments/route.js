import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Always serve fresh results — this route reads live vote counts.
export const dynamic = 'force-dynamic';

// The Lab creates its own client instead of importing the private one in
// dbOperations.js. It is built lazily inside a request (not at module scope) so a
// missing env var or missing table degrades to "voting opens soon" instead of
// crashing the build or the page.
let labSupabase = null;

function getLabSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  if (!labSupabase) {
    labSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return labSupabase;
}

// PostgREST reports a missing table as PGRST205 ("Could not find the table ... in the
// schema cache"); the SQL editor reports it as 42P01. Either means the schema in
// lab/sql/lab_schema.sql has not been run yet — an expected, handled state.
function isMissingTableError(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /does not exist|Could not find the table/i.test(error?.message || '')
  );
}

// Pure: vote rows in, counts per choice out.
function tallyVotes(votes) {
  const tallies = {};
  for (const vote of votes || []) {
    tallies[vote.choice] = (tallies[vote.choice] || 0) + 1;
  }
  return tallies;
}

async function fetchExperimentsWithTallies(supabase) {
  const { data: experiments, error: expError } = await supabase
    .from('lab_experiments')
    .select('id, slug, question, candidates, status, created_at')
    .order('created_at', { ascending: false });

  if (expError) throw expError;

  if (!experiments || experiments.length === 0) {
    return [];
  }

  // Tally in JS rather than a SQL group-by: Lab vote counts are tiny (hundreds, not
  // millions), and one extra query is cheaper than a Postgres function for now.
  const experimentIds = experiments.map((experiment) => experiment.id);
  const { data: votes, error: votesError } = await supabase
    .from('lab_experiment_votes')
    .select('experiment_id, choice')
    .in('experiment_id', experimentIds);

  if (votesError) throw votesError;

  return experiments.map((experiment) => {
    const experimentVotes = (votes || []).filter(
      (vote) => vote.experiment_id === experiment.id
    );
    return {
      id: experiment.id,
      slug: experiment.slug,
      question: experiment.question,
      candidates: experiment.candidates || [],
      status: experiment.status,
      tallies: tallyVotes(experimentVotes),
      totalVotes: experimentVotes.length,
    };
  });
}

export async function GET() {
  const supabase = getLabSupabase();
  if (!supabase) {
    return NextResponse.json({ available: false });
  }

  try {
    const experiments = await fetchExperimentsWithTallies(supabase);
    return NextResponse.json({ available: true, experiments });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ available: false });
    }
    console.error('Error fetching lab experiments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  // Vote identity inherits the app's current identity model: a plain x-user-email
  // header, unverified, like every other route (see /api/saved-responses). A spoofed
  // header can misattribute a single vote but cannot stuff several — the
  // unique(experiment_id, user_email) constraint caps every identity at one vote.
  const userEmail = request.headers.get('x-user-email');

  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { experimentId, choice } = body || {};
  if (!experimentId || !choice) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  const supabase = getLabSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Voting opens soon' }, { status: 503 });
  }

  try {
    const { data: experiment, error: expError } = await supabase
      .from('lab_experiments')
      .select('id, candidates, status')
      .eq('id', experimentId)
      .maybeSingle();

    if (expError) throw expError;

    if (!experiment) {
      return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
    }

    if (experiment.status !== 'voting') {
      return NextResponse.json({ error: 'This vote is closed' }, { status: 400 });
    }

    const candidateIds = (experiment.candidates || []).map(
      (candidate) => candidate.id
    );
    if (!candidateIds.includes(choice)) {
      return NextResponse.json({ error: 'Unknown choice' }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from('lab_experiment_votes')
      .insert({
        experiment_id: experiment.id,
        user_email: userEmail.trim().toLowerCase(),
        choice,
      });

    if (insertError) {
      // 23505 = unique_violation on (experiment_id, user_email)
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'You already voted in this one' },
          { status: 409 }
        );
      }
      if (isMissingTableError(insertError)) {
        return NextResponse.json({ error: 'Voting opens soon' }, { status: 503 });
      }
      throw insertError;
    }

    const { data: votes, error: tallyError } = await supabase
      .from('lab_experiment_votes')
      .select('choice')
      .eq('experiment_id', experiment.id);

    if (tallyError) throw tallyError;

    return NextResponse.json({
      success: true,
      tallies: tallyVotes(votes),
      totalVotes: (votes || []).length,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: 'Voting opens soon' }, { status: 503 });
    }
    console.error('Error casting lab vote:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
