import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqLineItems, rfqInvitations, quoteSubmissions, suppliers } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import { normalizeRFQDocument } from '@/lib/rfq-document';

/**
 * All quote submissions for an RFQ, flattened for the comparison table.
 * Each row carries parent fields (supplier, total, delivery) plus the raw
 * formData and per-line-item pricing so the client can filter/sort on
 * child-field values (unit price of a line item, a questionnaire answer, …).
 */
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

    const rows = await db
      .select({
        invitation: rfqInvitations,
        submission: quoteSubmissions,
        supplier: suppliers,
      })
      .from(rfqInvitations)
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .leftJoin(
        quoteSubmissions,
        eq(quoteSubmissions.rfqInvitationId, rfqInvitations.id)
      )
      .where(eq(rfqInvitations.rfqId, id));

    const quotes = rows.map((r) => ({
      invitationId: r.invitation.id,
      supplierId: r.supplier.id,
      supplierName: r.supplier.companyName,
      status: r.invitation.status,
      remindersSent: r.invitation.remindersSent ?? 0,
      submittedAt: r.submission?.submittedAt ?? null,
      totalAmount: r.submission?.totalAmount ?? null,
      currency: r.submission?.currency ?? 'USD',
      notes: r.submission?.notes ?? null,
      formData: (r.submission?.formData as Record<string, unknown>) ?? {},
      lineItems: (r.submission?.lineItems as Array<Record<string, unknown>>) ?? [],
    }));

    const rfqDoc = rfq.rfqDocument
      ? normalizeRFQDocument(rfq.rfqDocument, { rfqId: rfq.id, buyer: '', fillDefaults: false })
      : null;
    const currency = rfqDoc?.header.currency || 'INR';

    return NextResponse.json({
      rfq: {
        id: rfq.id,
        title: rfq.title,
        status: rfq.status,
        formSchema: rfq.formSchema,
        currency,
      },
      lineItems: lineItems.map((li) => ({
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unit: li.unit,
      })),
      quotes,
    });
  } catch (error) {
    return serverError(error);
  }
}
