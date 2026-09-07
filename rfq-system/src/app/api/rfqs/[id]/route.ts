import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqLineItems } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';

// Fetch a single RFQ with its line items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');

    const lineItems = await db
      .select()
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, id))
      .orderBy(asc(rfqLineItems.orderIndex));

    return NextResponse.json({ rfq, lineItems });
  } catch (error) {
    return serverError(error);
  }
}

// Update an RFQ (e.g. edit the form schema before sending)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [existing] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!existing) return notFound('RFQ not found');
    if (existing.status !== 'draft') {
      return badRequest('Only draft RFQs can be edited');
    }

    const body = await request.json();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') patch.title = body.title;
    if (typeof body.description === 'string') patch.description = body.description;
    if (body.formSchema) patch.formSchema = body.formSchema;
    if (body.deadline !== undefined) {
      patch.deadline = body.deadline ? new Date(body.deadline) : null;
    }

    const [rfq] = await db.update(rfqs).set(patch).where(eq(rfqs.id, id)).returning();

    if (Array.isArray(body.lineItems)) {
      await db.delete(rfqLineItems).where(eq(rfqLineItems.rfqId, id));
      if (body.lineItems.length > 0) {
        await db.insert(rfqLineItems).values(
          body.lineItems.map((li: any, index: number) => ({
            rfqId: id,
            itemDescription: li.itemDescription,
            quantity: li.quantity,
            unit: li.unit,
            specifications: li.specifications ?? {},
            orderIndex: index,
          }))
        );
      }
    }

    return NextResponse.json({ rfq });
  } catch (error) {
    return serverError(error);
  }
}
