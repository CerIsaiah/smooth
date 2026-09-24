/**
 * Route tests for src/app/api/openai/route.js
 *
 * The route instantiates `new OpenAI(...)` at module scope, so the 'openai'
 * module is mocked before the route is imported. Usage-limit enforcement is
 * delegated to checkUsageStatus — mocked here to drive the route's own
 * enforcement branch (limitReached → 403).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/openai/route';
import { checkUsageStatus } from '@/utils/usageTracking';
import { getOpenAIMock } from '../helpers/external-clients-mock.js';
import { makeRequest, BASE } from '../helpers/request.js';

vi.mock('openai', async () => {
  const { createOpenAIMockModule } = await import('../helpers/external-clients-mock.js');
  return createOpenAIMockModule();
});

vi.mock('@/utils/usageTracking', () => ({
  checkUsageStatus: vi.fn(),
}));

const openai = getOpenAIMock();
const TEN_RESPONSES = Array.from({ length: 10 }, (_, i) => `reply ${i}`);

beforeEach(() => {
  vi.clearAllMocks();
  checkUsageStatus.mockResolvedValue({ limitReached: false, isPremium: false, isTrial: false, dailySwipes: 0 });
  openai.chat.completions.create.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ responses: TEN_RESPONSES }) } }],
  });
});

describe('POST /api/openai — usage enforcement', () => {
  it('returns 403 with the anonymous message when limitReached (enforcement path)', async () => {
    checkUsageStatus.mockResolvedValue({ limitReached: true, dailySwipes: 14 });

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body: { context: 'hey', lastText: 'hi' },
    }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Anonymous usage limit reached. Please sign in to continue.');
    expect(typeof body.requestId).toBe('string');
  });

  it('returns 403 with the upgrade message for signed-in users when limitReached', async () => {
    checkUsageStatus.mockResolvedValue({ limitReached: true, dailySwipes: 99 });

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com' },
      body: { context: 'hey', lastText: 'hi' },
    }));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Daily limit reached. Please upgrade to continue.');
  });

  it('checks usage with the email identifier for signed-in users', async () => {
    await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      headers: { 'x-user-email': 'a@b.com', 'x-forwarded-for': '1.2.3.4' },
      body: { context: 'hey', lastText: 'hi' },
    }));

    expect(checkUsageStatus).toHaveBeenCalledWith('a@b.com', true);
  });

  it('falls back to the first IP from x-forwarded-for for anonymous users', async () => {
    await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
      body: { context: 'hey', lastText: 'hi' },
    }));

    expect(checkUsageStatus).toHaveBeenCalledWith('1.2.3.4', false);
  });

  it("uses 'unknown' when no IP or email headers are present", async () => {
    await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'hey', lastText: 'hi' },
    }));

    expect(checkUsageStatus).toHaveBeenCalledWith('unknown', false);
  });
});

describe('POST /api/openai — input validation', () => {
  it('returns 400 when neither image nor context+lastText are provided', async () => {
    const res = await POST(makeRequest(`${BASE}/api/openai`, { method: 'POST', body: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Please provide either an image or conversation details');
  });

  it('returns 400 when only context is provided (lastText missing)', async () => {
    const res = await POST(makeRequest(`${BASE}/api/openai`, { method: 'POST', body: { context: 'hey' } }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when both image and conversation details are provided', async () => {
    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { imageBase64: 'QUJD', context: 'hey', lastText: 'hi' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Please provide either an image or conversation details, not both');
  });
});

describe('POST /api/openai — generation', () => {
  it('returns 10 parsed responses for the text path', async () => {
    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'she said hi', lastText: 'hi' },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.responses).toHaveLength(10);
    expect(body.responses[0]).toBe('reply 0');
    expect(typeof body.requestId).toBe('string');

    const call = openai.chat.completions.create.mock.calls[0][0];
    expect(call.model).toContain('ft:gpt-4o');
    expect(call.messages[0].role).toBe('system');
    expect(call.messages[1].content[0].text).toContain('Context of conversation: she said hi');
    expect(call.messages[1].content[0].text).toContain('Last message from them: hi');
  });

  it('builds an image_url message for the image path', async () => {
    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { imageBase64: 'QUJD' },
    }));

    expect(res.status).toBe(200);
    const call = openai.chat.completions.create.mock.calls[0][0];
    expect(call.messages[1].content[0].text).toBe('What should I say back?');
    expect(call.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('returns 500 with the error message when the model returns the wrong number of responses', async () => {
    openai.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ responses: TEN_RESPONSES.slice(0, 9) }) } }],
    });

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'a', lastText: 'b' },
    }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Invalid number of responses: Expected 10, got 9');
  });

  it('returns 500 when the model refuses', async () => {
    openai.chat.completions.create.mockResolvedValue({
      choices: [{ message: { refusal: 'Cannot help with that', content: null } }],
    });

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'a', lastText: 'b' },
    }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Model refused to generate response: Cannot help with that');
  });

  it('returns 500 when the completion content is not valid JSON', async () => {
    openai.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: 'not json at all' } }],
    });

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'a', lastText: 'b' },
    }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeTruthy();
  });

  it('returns 500 when the OpenAI call itself fails', async () => {
    openai.chat.completions.create.mockRejectedValue(new Error('rate limited'));

    const res = await POST(makeRequest(`${BASE}/api/openai`, {
      method: 'POST',
      body: { context: 'a', lastText: 'b' },
    }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('rate limited');
  });
});
