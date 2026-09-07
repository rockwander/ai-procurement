import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-change-this'
);

export interface JWTPayload extends Record<string, any> {
  userId: string;
  email: string;
  role: 'procurement' | 'supplier';
  name: string;
}

// Generate JWT token
export async function generateToken(payload: JWTPayload): Promise<string> {
  const token = await new SignJWT(payload as JoseJWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  return token;
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as JWTPayload;
  } catch (error) {
    return null;
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Verify password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Authenticate user
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: JWTPayload; token?: string; error?: string }> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const token = await generateToken(payload);

    return { success: true, user: payload, token };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

// Get user from token (for middleware)
export async function getUserFromToken(token: string) {
  const payload = await verifyToken(token);
  if (!payload) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  return user || null;
}
