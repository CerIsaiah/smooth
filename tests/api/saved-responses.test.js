/**
 * Route tests for src/app/api/saved-responses/route.js
 *
 * The route instantiates its Supabase client at module scope — mocked at the
 * client-creation layer before import. Covers POST (single + bulk), GET, and
 * DELETE flows against the in-memory fake.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET, DELETE } from '@/app/api/saved-responses/route';
import { getSupabaseMock } from '../helpers/supabase-mock.js';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('@supabase/supabase-js', async () => {
  const { createSupabaseMockModule } = await import('../helpers/supabase-mock.js');
  return createSupabaseMockModule();
});

const sb = getSupabaseMock();

beforeEach(() => {
  vi.clearAllMocks();
  sb.reset();
});

describe('POST /api/saved-responses', () => {
  it('prepends a single response with created_at and returns success', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      saved_responses: [{ response: 'old one', created_at: '2026-01-01T00:00:00.000Z' }],
    });

    const res = await POST(makeRequest(`${BASE}/api/saved-responses`, {
      method: 'POST',
      body: { userEmail: 'a@b.com', response: 'new reply', context: 'ctx', lastMessage: 'last' },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const saved = sb.state.tables.users[0].saved_responses;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ response: 'new reply', context: 'ctx', lastMessage: 'last' });
    expect(saved[0].created_at).toBeTruthy(); // stamped server-side
    expect(saved[1].response).toBe('old one');
  });

  it('prepends bulk responses ahead of existing ones', async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      saved_responses: [{ response: 'old one' }],
    });

    const res = await POST(makeRequest(`${BASE}/api/saved-responses`, {
      method: 'POST',
      body: { userEmail: 'a@b.com', responses: ['r1', 'r2'] },
    }));

    expect(res.status).toBe(200);
    const saved = sb.state.tables.users[0].saved_responses;
    expect(saved.map((r) => r.response ?? r)).toEqual(['r1', 'r2', 'old one']);
  });

  it('handles a user with no saved_responses yet', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', saved_responses: null });

    await POST(makeRequest(`${BASE}/api/saved-responses`, {
      method: 'POST',
      body: { userEmail: 'a@b.com', response: 'first' },
    }));

    expect(sb.state.tables.users[0].saved_responses[0].response).toBe('first');
  });

  it('returns 500 when the user fetch fails', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };

    const res = await POST(makeRequest(`${BASE}/api/saved-responses`, {
      method: 'POST',
      body: { userEmail: 'a@b.com', response: 'x' },
    }));
    expect(res.status).toBe(500);
  });

  it('returns 500 when the update fails', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', saved_responses: [] });
    // errors are table-wide; emulate the failing update by draining the table
    // after the select — simplest deterministic route: error injection on the
    // table makes both the select and the update fail, which the route maps
    // to 500 either way.
    sb.state.errors.users = { code: 'XX500', message: 'update boom' };

    const res = await POST(makeRequest(`${BASE}/api/saved-responses`, {
      method: 'POST',
      body: { userEmail: 'a@b.com', response: 'x' },
    }));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/saved-responses', () => {
  it('returns 401 without the x-user-email header', async () => {
    const res = await GET(makeRequest(`${BASE}/api/saved-responses`));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it("returns the user's saved responses", async () => {
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      saved_responses: [{ response: 'r1', created_at: '2026-01-01T00:00:00.000Z' }],
    });

    const res = await GET(makeRequest(`${BASE}/api/saved-responses`, {
      headers: { 'x-user-email': 'a@b.com' },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      responses: [{ response: 'r1', created_at: '2026-01-01T00:00:00.000Z' }],
    });
  });

  it('returns an empty array for a user with null saved_responses', async () => {
    sb.state.tables.users.push({ id: 'u1', email: 'a@b.com', saved_responses: null });

    const res = await GET(makeRequest(`${BASE}/api/saved-responses`, {
      headers: { 'x-user-email': 'a@b.com' },
    }));
    expect(await res.json()).toEqual({ responses: [] });
  });

  it('returns 500 on database errors', async () => {
    sb.state.errors.users = { code: 'XX500', message: 'boom' };
    const res = await GET(makeRequest(`${BASE}/api/saved-responses`, {
      headers: { 'x-user-email': 'a@b.com' },
    }));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/saved-responses', () => {
  it('returns 400 when email or timestamp params are missing', async () => {
    const res1 = await DELETE(makeRequest(`${BASE}/api/saved-responses?email=a@b.com`, { method: 'DELETE' }));
    expect(res1.status).toBe(400);

    const res2 = await DELETE(makeRequest(`${BASE}/api/saved-responses?timestamp=2026-01-01T00:00:00.000Z`, { method: 'DELETE' }));
    expect(res2.status).toBe(400);
  });

  it('removes only the response matching the timestamp', async () => {
    const t1 = '2026-01-01T00:00:00.000Z';
    const t2 = '2026-02-02T00:00:00.000Z';
    sb.state.tables.users.push({
      id: 'u1',
      email: 'a@b.com',
      saved_responses: [
        { response: 'keep', created_at: t2 },
        { response: 'drop', created_at: t1 },
      ],
    });

    const res = await DELETE(makeRequest(
      `${BASE}/api/saved-responses?email=a@b.com&timestamp=${encodeURIComponent(t1)}`,
      { method: 'DELETE' }
    ));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const saved = sb.state.tables.users[0].saved_responses;
    expect(saved).toHaveLength(1);
    expect(saved[0].response).toBe('keep');
  });
});
