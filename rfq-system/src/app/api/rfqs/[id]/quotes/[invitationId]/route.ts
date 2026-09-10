import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  rfqs,
  rfqLineItems,
  rfqInvitations,
  quoteSubmissions,
  quoteComments,
  suppliers,
} from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import { normalizeRFQDocument, rfqDocumentToText } from '@/lib/rfq-document';

/**
 * One supplier's submitted quote for an RFQ, with the buyer's comments on it.
 * Backs the quote-detail / review page. See REQUIREMENT_quote-negotiation.md.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id, invitationId } = await params;

    const [row] = await db
      .select({
        invitation: rfqInvitations,
        supplier: suppliers,
        rfq: rfqs,
      })
      .from(rfqInvitations)
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .innerJoin(rfqs, eq(rfqInvitations.rfqId, rfqs.id))
      .where(eq(rfqInvitations.id, invitationId));

    if (!row || row.rfq.id !== id) return notFound('Quote not found');

    const [submission] = await db
      .select()
      .from(quoteSubmissions)
      .where(eq(quoteSubmissions.rfqInvitationId, invitationId));

    if (!submission) return notFound('This supplier has not submitted a quote');

    const lineItems = await db
      .select()
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, id))
      .orderBy(asc(rfqLineItems.orderIndex));

    const comments = await db
      .select()
      .from(quoteComments)
      .where(eq(quoteComments.rfqInvitationId, invitationId))
      .orderBy(asc(quoteComments.createdAt));

    const rfqDoc = row.rfq.rfqDocument
      ? normalizeRFQDocument(row.rfq.rfqDocument, {
          rfqId: row.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : null;

    return NextResponse.json({
      rfq: {
        id: row.rfq.id,
        title: row.rfq.title,
        status: row.rfq.status,
        currency: rfqDoc?.header.currency || 'INR',
        formSchema: row.rfq.formSchema,
        terms: rfqDoc?.termsAndConditions ?? [],
        header: rfqDoc
          ? {
              buyer: rfqDoc.header.buyer,
              expectedDelivery: rfqDoc.header.expectedDelivery,
              validity: rfqDoc.header.validity,
            }
          : { buyer: '', expectedDelivery: '', validity: '' },
        summary: rfqDoc ? rfqDocumentToText(rfqDoc).slice(0, 2000) : row.rfq.description,
      },
      invitation: {
        id: row.invitation.id,
        status: row.invitation.status,
        token: row.invitation.token,
      },
      supplier: { id: row.supplier.id, companyName: row.supplier.companyName },
      lineItems: lineItems.map((li) => ({
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unit: li.unit,
      })),
      submission: {
        formData: submission.formData,
        lineItems: submission.lineItems,
        notes: submission.notes ?? '',
        exceptions: submission.exceptions ?? [],
        totalAmount: submission.totalAmount,
        currency: submission.currency,
        revision: submission.revision,
        submittedAt: submission.submittedAt,
        revisedAt: submission.revisedAt,
      },
      comments: comments.map((c) => ({
        id: c.id,
        round: c.round,
        fieldId: c.fieldId,
        fieldLabel: c.fieldLabel,
        quotedValue: c.quotedValue,
        comment: c.comment,
        intent: c.intent,
        status: c.status,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
      })),
    });
  } catch (error) {
    return serverError(error);
  }
}
