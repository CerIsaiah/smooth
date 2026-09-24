/**
 * Builds real NextRequest objects (next@15 server runtime) so route handlers
 * are exercised against the same request shape Next.js gives them: immutable
 * Headers, .json(), .text(), request.url with search params.
 */
import { NextRequest } from 'next/server';

export function makeRequest(url, { method = 'GET', headers = {}, body } = {}) {
  const init = { method, headers };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers = { 'content-type': 'application/json', ...init.headers };
  }
  return new NextRequest(url, init);
}

export const BASE = 'http://localhost:3000';
