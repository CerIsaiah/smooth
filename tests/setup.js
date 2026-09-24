// Global test setup.
//
// External clients (Supabase, Stripe, OpenAI, Google OAuth) are mocked at the
// module-creation layer in each test file — these env vars are only a safety
// net so that any module-scope constructor which escapes a mock still receives
// a shape-valid value instead of throwing on undefined.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_placeholder';
process.env.SUPABASE_URL ??= 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'placeholder';
process.env.OPENAI_API_KEY ??= 'sk-placeholder';
process.env.GOOGLE_CLIENT_ID ??= 'placeholder-client-id';

// The usage-tracking code mixes PST wall-clock time (via toLocaleString with
// timeZone: 'America/Los_Angeles') with UTC-encoded timestamps. The resulting
// behavior depends on the machine timezone that re-parses those locale
// strings, so pin the process to UTC for deterministic tests (CI matches).
process.env.TZ = 'UTC';
