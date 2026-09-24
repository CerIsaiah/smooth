/**
 * Mock factories for the external clients that the API routes instantiate at
 * module scope: `new Stripe(...)` in the Stripe routes, `new OpenAI(...)`,
 * and `new OAuth2Client(...)` in the Google auth route.
 *
 * The factories return the mocked module shape; the singleton instance is
 * retrieved in test bodies via the getters. Because Vitest runs each test
 * file in its own module registry, the singleton never leaks across files.
 */

import { vi } from 'vitest';

let stripeInstance = null;
let openaiInstance = null;
let googleInstance = null;

export function getStripeMock() {
  return stripeInstance;
}

export function getOpenAIMock() {
  return openaiInstance;
}

export function getGoogleAuthMock() {
  return googleInstance;
}

/** vi.mock('stripe', async () => { const m = await import('.../external-clients-mock.js'); return m.createStripeMockModule(); }) */
export function createStripeMockModule() {
  stripeInstance = {
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    customers: { list: vi.fn() },
    subscriptions: { list: vi.fn(), update: vi.fn() },
  };
  // `new Stripe(key)` must return the shared instance so routes capture it.
  return { default: vi.fn(function StripeMock() { return stripeInstance; }) };
}

/** vi.mock('openai', ...) — route does `new OpenAI({ apiKey })` then `openai.chat.completions.create(...)` */
export function createOpenAIMockModule() {
  openaiInstance = {
    chat: { completions: { create: vi.fn() } },
  };
  return { default: vi.fn(function OpenAIMock() { return openaiInstance; }) };
}

/** vi.mock('google-auth-library', ...) — route does `new OAuth2Client(...)` then `client.verifyIdToken(...)` */
export function createGoogleAuthMockModule() {
  googleInstance = {
    getPayload: vi.fn(),
    verifyIdToken: vi.fn(),
  };
  // Default: verifyIdToken hands back the shared getPayload mock, matching
  // the real client's { getPayload() } resolution shape.
  googleInstance.verifyIdToken.mockImplementation(() =>
    Promise.resolve({ getPayload: googleInstance.getPayload })
  );
  return { OAuth2Client: vi.fn(function OAuth2ClientMock() { return googleInstance; }) };
}
