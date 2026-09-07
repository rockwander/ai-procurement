import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, badRequest, notFound, serverError } from '@/lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Edit a supplier's contact details / categories.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await request.json();

    const patch: Partial<typeof suppliers.$inferInsert> = {};

    if (body.companyName !== undefined) {
      const name = String(body.companyName).trim();
      if (!name) return badRequest('Company name cannot be empty');
      patch.companyName = name;
    }

    if (body.contactEmail !== undefined) {
      const email = String(body.contactEmail).trim();
      if (!EMAIL_RE.test(email)) return badRequest('Invalid email address');
      patch.contactEmail = email;
    }

    if (body.contactPhone !== undefined) {
      const phone = String(body.contactPhone).trim();
      patch.contactPhone = phone || null;
    }

    if (body.categories !== undefined) {
      if (!Array.isArray(body.categories)) return badRequest('categories must be an array');
      patch.categories = body.categories.map((c: unknown) => String(c).trim()).filter(Boolean);
    }

    if (Object.keys(patch).length === 0) return badRequest('Nothing to update');
    patch.updatedAt = new Date();

    const [updated] = await db
      .update(suppliers)
      .set(patch)
      .where(eq(suppliers.id, id))
      .returning();

    if (!updated) return notFound('Supplier not found');

    return NextResponse.json({ supplier: updated });
  } catch (error) {
    return serverError(error);
  }
}
