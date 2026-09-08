import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateToken } from '@/lib/auth';

/**
 * POC convenience: log in as the seeded procurement admin with no credentials.
 * Only active when POC_AUTOLOGIN=1. Returns 404 otherwise so it looks like it
 * doesn't exist.
 */
const ADMIN_EMAIL = process.env.POC_ADMIN_EMAIL || 'admin@procurement.ai';

export async function POST() {
  if (process.env.POC_AUTOLOGIN !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (!admin || admin.role !== 'procurement') {
    return NextResponse.json({ error: 'Admin user not seeded' }, { status: 500 });
  }

  const token = await generateToken({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    name: admin.name,
  });

  const res = NextResponse.json({
    success: true,
    user: { userId: admin.id, email: admin.email, role: admin.role, name: admin.name },
  });
  res.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}

// GET tells the client whether auto-login is available.
export async function GET() {
  return NextResponse.json({ enabled: process.env.POC_AUTOLOGIN === '1' });
}
