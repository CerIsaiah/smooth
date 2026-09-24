/**
 * Route tests for src/app/api/auth/google-client-id/route.js — exposes the
 * Google OAuth client id to the browser.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/auth/google-client-id/route';
import { makeRequest, BASE } from '../helpers/request.js';

describe('GET /api/google-client-id', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured client id', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'my-client-id.apps.googleusercontent.com');

    const res = await GET(makeRequest(`${BASE}/api/google-client-id`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientId: 'my-client-id.apps.googleusercontent.com' });
  });

  it('returns 500 with the env diagnostic when GOOGLE_CLIENT_ID is unset', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');

    const res = await GET(makeRequest(`${BASE}/api/google-client-id`));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Google Client ID not configured');
    expect(body.envVars).toContain('GOOGLE_CLIENT_ID');
  });
});
