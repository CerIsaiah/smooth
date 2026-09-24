import { defineConfig } from 'vitest/config';
import path from 'node:path';

// TZ=UTC makes the PST/UTC mixing behaviors in usageTracking/dbOperations
// deterministic: locale-formatted PST wall-clock strings are re-parsed in the
// machine timezone, so pin the machine to UTC (same as CI).
process.env.TZ = 'UTC';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    env: {
      TZ: 'UTC',
      // Placeholder credentials. All external clients (Supabase, Stripe,
      // OpenAI, Google OAuth) are mocked at the module layer, so nothing
      // here is ever used to make a real network call — the values only
      // need to exist and be shape-valid for module-scope constructors.
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder',
      OPENAI_API_KEY: 'sk-placeholder',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
