import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { policyDocuments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';

// List active policy documents (for the RFQ drafting policy selector)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const rows = await db
      .select()
      .from(policyDocuments)
      .where(eq(policyDocuments.isActive, true));

    return NextResponse.json({ policies: rows });
  } catch (error) {
    return serverError(error);
  }
}
