import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, type JWTPayload } from '@/lib/auth';

/**
 * Resolve the authenticated procurement user for an API route.
 * Reads the `auth-token` httpOnly cookie set at login.
 * Returns null when unauthenticated (routes should 401).
 */
export async function getAuthUser(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get('auth-token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'procurement') return null;
  return payload;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error('API error:', error);
  return NextResponse.json({ error: message }, { status: 500 });
}
