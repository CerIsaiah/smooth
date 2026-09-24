-- Dating App Lab v1 — schema
--
-- Run this in the Supabase SQL editor. This repo keeps no migrations directory;
-- schema is managed directly in Supabase (same as the existing users/ip_usage tables).
-- Every statement is idempotent, so it is safe to run twice.
--
-- RLS: intentionally not configured. Every Supabase client in this app is created
-- server-side with SUPABASE_SERVICE_ROLE_KEY (see src/utils/dbOperations.js and the
-- routes under src/app/api/), and the service role bypasses RLS. The browser never
-- talks to Supabase directly — all access goes through Next.js route handlers. If you
-- turn RLS on later, keep it deny-all-to-anon and these routes keep working unchanged.

CREATE TABLE IF NOT EXISTS lab_experiments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE,
  question text,
  candidates jsonb,
  status text DEFAULT 'voting',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_experiment_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid REFERENCES lab_experiments,
  user_email text,
  choice text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (experiment_id, user_email)
);

-- First experiment: the opening vote. One row, five candidates a solo builder can
-- actually run on sacrificial accounts. The IF-guard keeps this idempotent.
INSERT INTO lab_experiments (slug, question, candidates, status)
SELECT
  'what-should-we-test-first',
  'What should we test first?',
  '[
    {"id": "boost",      "label": "Do Hinge Boosts get you more matches, or just more notifications?"},
    {"id": "photos",     "label": "Does one great photo beat five okay ones?"},
    {"id": "humor",      "label": "Do funny first messages beat safe ones?"},
    {"id": "timing",     "label": "Does replying fast work better than waiting a few hours?"},
    {"id": "sunglasses", "label": "Do sunglasses in photos help or hurt?"}
  ]'::jsonb,
  'voting'
WHERE NOT EXISTS (
  SELECT 1 FROM lab_experiments WHERE slug = 'what-should-we-test-first'
);
