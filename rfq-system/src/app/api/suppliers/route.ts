import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';

// List all active suppliers (raw, unranked)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const rows = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.isActive, true));

    // Distinct category list for the pre-filter UI
    const categories = Array.from(
      new Set(rows.flatMap((r) => (r.categories as string[]) || []))
    ).sort();

    return NextResponse.json({ suppliers: rows, categories });
  } catch (error) {
    return serverError(error);
  }
}
