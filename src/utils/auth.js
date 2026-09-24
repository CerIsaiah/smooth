/**
 * Shared authentication utilities.
 *
 * Identity model:
 * - Signed-in identity comes exclusively from the `smoothrizz_session` httpOnly
 *   cookie minted by /api/auth/google after the Google ID token is verified
 *   server-side. The cookie holds a compact HMAC-SHA256-signed token (JWT
 *   format) that the client cannot read or forge.
 * - Anonymous identity falls back to the request IP (x-forwarded-for) for
 *   usage-tracking flows only.
 *
 * All authenticated routes must derive identity through these helpers — never
 * from client-supplied headers (x-user-email) or body/query fields.
 *
 * Env vars:
 * - AUTH_SESSION_SECRET: HMAC key for session tokens. Generate with
 *   `openssl rand -base64 32`. Rotating it signs everyone out.
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'smoothrizz_session';

// 7 days, matching typical Google web-session longevity.
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET || null;
}

/** Mints a signed session token. Throws if AUTH_SESSION_SECRET is unset. */
export function createSessionToken(payload, expiresInSeconds = SESSION_MAX_AGE_SECONDS) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('AUTH_SESSION_SECRET is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/** Verifies a session token's signature and expiry. Returns the session or null. */
export function verifySessionToken(token) {
  if (!token) return null;

  const secret = getSessionSecret();
  if (!secret) return null; // Fail closed: no secret, no sessions.

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  // Reject anything but the algorithm we sign with (defense in depth).
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
  } catch {
    return null;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (!payload.email) return null;

  return {
    email: String(payload.email).toLowerCase().trim(),
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

function sessionCookieHeader(token, maxAge) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/** Set-Cookie value that establishes a session. */
export function createSessionCookieHeader(token) {
  return sessionCookieHeader(token, SESSION_MAX_AGE_SECONDS);
}

/** Set-Cookie value that expires the session (sign-out). */
export function clearSessionCookieHeader() {
  return sessionCookieHeader('', 0);
}

/** Parses the verified session from the request's cookies, or returns null. */
export function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) return [pair.trim(), ''];
      return [pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1).trim()];
    })
  );

  return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
}

/** Client IP from proxy headers — the anonymous usage identity. */
export function getClientIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Single source of truth for route identity:
 * - email/name/picture come only from the verified session cookie.
 * - ip comes from proxy headers and is used only for anonymous usage tracking.
 */
export function resolveIdentity(request) {
  const session = getSessionFromRequest(request);
  return {
    email: session?.email ?? null,
    name: session?.name ?? null,
    picture: session?.picture ?? null,
    isSignedIn: Boolean(session?.email),
    ip: getClientIP(request),
  };
}

/** For routes that exist only for signed-in users: returns { session } or { error: 401 }. */
export function requireSession(request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session, error: null };
}
