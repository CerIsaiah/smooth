"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// One vote per person, per experiment. The server enforces it with a unique
// constraint; this key just remembers the choice locally so the voted state
// renders on the next visit without a round trip.
function voteStorageKey(experimentId) {
  return `smoothrizz_lab_voted_${experimentId}`;
}

// Pure: counts first, percentage second — "7 of 18 votes (39%)".
function formatVoteCount(count, total) {
  if (!total) return '0 votes';
  const percent = Math.round((count / total) * 100);
  return `${count} of ${total} votes (${percent}%)`;
}

function getStoredUserEmail() {
  try {
    const stored = localStorage.getItem('smoothrizz_user');
    return stored ? JSON.parse(stored)?.email || null : null;
  } catch {
    return null;
  }
}

function CandidateButton({ candidate, votes, total, disabled, selected, onSelect }) {
  const count = votes[candidate.id] || 0;
  const percent = total ? Math.round((count / total) * 100) : 0;

  return (
    <button
      onClick={() => onSelect(candidate.id)}
      disabled={disabled}
      className={`w-full text-left border rounded-lg p-4 transition-all duration-200 ${
        selected
          ? 'border-pink-500 bg-pink-50'
          : 'border-gray-200 bg-white hover:border-pink-400 hover:bg-gray-50'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm sm:text-base text-gray-800 font-medium">
          {candidate.label}
        </span>
        {total > 0 && (
          <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap mt-0.5">
            {formatVoteCount(count, total)}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="mt-2 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-4 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function VoteBox() {
  const [loadState, setLoadState] = useState('loading');
  const [experiment, setExperiment] = useState(null);
  const [tallies, setTallies] = useState({});
  const [totalVotes, setTotalVotes] = useState(0);
  const [myChoice, setMyChoice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const loadVote = useCallback(async () => {
    setLoadState('loading');
    try {
      const response = await fetch('/api/lab/experiments');
      const data = await response.json();

      if (!response.ok) {
        setLoadState('error');
        return;
      }

      if (!data.available || !data.experiments || data.experiments.length === 0) {
        setLoadState('closed-soon');
        return;
      }

      const live = data.experiments.find((e) => e.status === 'voting') || data.experiments[0];
      setExperiment(live);
      setTallies(live.tallies || {});
      setTotalVotes(live.totalVotes || 0);
      setMyChoice(localStorage.getItem(voteStorageKey(live.id)));
      setIsSignedIn(Boolean(getStoredUserEmail()));
      setLoadState('ready');
    } catch (error) {
      console.error('Error loading lab vote:', error);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    loadVote();
  }, [loadVote]);

  const castVote = async (choiceId) => {
    if (!isSignedIn) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const stored = getStoredUserEmail();
      const response = await fetch('/api/lab/experiments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': stored,
        },
        body: JSON.stringify({ experimentId: experiment.id, choice: choiceId }),
      });
      const data = await response.json();

      if (response.status === 409) {
        // Already voted server-side — show the standing vote.
        setMyChoice(localStorage.getItem(voteStorageKey(experiment.id)) || choiceId);
        return;
      }
      if (!response.ok) {
        setSubmitError(data.error || 'Something went wrong. Try again.');
        return;
      }

      setMyChoice(choiceId);
      setTallies(data.tallies || {});
      setTotalVotes(data.totalVotes || 0);
      localStorage.setItem(voteStorageKey(experiment.id), choiceId);

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'lab_vote', { experiment_id: experiment.id, choice: choiceId });
      }
    } catch (error) {
      console.error('Error casting lab vote:', error);
      setSubmitError('Could not reach the vote. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return <LoadingSkeleton />;
  }

  if (loadState === 'closed-soon') {
    return (
      <div className="bg-gray-50 rounded-lg p-5 text-sm sm:text-base text-gray-600">
        Voting opens soon. The first vote is being set up.
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="bg-gray-50 rounded-lg p-5">
        <p className="text-sm sm:text-base text-gray-700 mb-3">
          The vote did not load. Check your connection, then try again.
        </p>
        <button
          onClick={loadVote}
          className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  const hasVoted = Boolean(myChoice);

  return (
    <div className="space-y-4">
      <p className="text-sm sm:text-base text-gray-700">
        One vote per person. {totalVotes > 0 ? `${totalVotes} votes so far.` : 'Be the first.'}
      </p>

      <div className="space-y-3">
        {experiment.candidates.map((candidate) => (
          <CandidateButton
            key={candidate.id}
            candidate={candidate}
            votes={tallies}
            total={totalVotes}
            disabled={hasVoted || submitting || !isSignedIn}
            selected={myChoice === candidate.id}
            onSelect={castVote}
          />
        ))}
      </div>

      {hasVoted ? (
        <p className="text-sm sm:text-base text-gray-700 font-medium">
          You voted. The winner gets tested first.
        </p>
      ) : isSignedIn ? (
        <p className="text-sm sm:text-base text-gray-600">
          Pick one. We run the winner first and publish what happened, numbers attached.
        </p>
      ) : (
        <p className="text-sm sm:text-base text-gray-600">
          <Link href="/" className="text-pink-500 font-medium hover:underline">
            Sign in on the homepage
          </Link>{' '}
          to vote. It&rsquo;s free, and it takes one click.
        </p>
      )}

      {submitError && (
        <p className="text-sm text-red-500">{submitError}</p>
      )}
    </div>
  );
}
