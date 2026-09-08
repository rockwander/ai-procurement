import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqInvitations, quoteSubmissions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { normalizeRFQDocument, rfqDocumentToText, emptyRFQDocument } from '@/lib/rfq-document';
import { normaliseLineResponse, type RFQLineForResponse } from '@/lib/line-response';

// Public: load the RFQ + form schema for a supplier's tokenized link.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');

    // Mark as viewed on first open.
    if (ctx.invitation.status === 'sent') {
      await db
        .update(rfqInvitations)
        .set({ status: 'viewed', viewedAt: new Date() })
        .where(eq(rfqInvitations.id, ctx.invitation.id));
    }

    const rfqDoc = ctx.rfq.rfqDocument
      ? normalizeRFQDocument(ctx.rfq.rfqDocument, {
          rfqId: ctx.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : emptyRFQDocument(ctx.rfq.id, '');
    const summary = ctx.rfq.rfqDocument
      ? rfqDocumentToText(rfqDoc).slice(0, 2000)
      : ctx.rfq.description;

    return NextResponse.json({
      rfq: {
        title: ctx.rfq.title,
        summary,
        deadline: ctx.rfq.deadline,
        currency: rfqDoc.header.currency || 'INR',
      },
      supplier: { companyName: ctx.supplier.companyName },
      formSchema: ctx.rfq.formSchema,
      lineItems: ctx.lineItems.map((li) => ({
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unit: li.unit,
      })),
      submitted: ctx.invitation.status === 'submitted',
      submission: ctx.submission
        ? { formData: ctx.submission.formData, lineItems: ctx.submission.lineItems, submittedAt: ctx.submission.submittedAt }
        : null,
    });
  } catch (error) {
    return serverError(error);
  }
}

// Public: submit the quote. One-shot — locks after submission.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');

    if (ctx.invitation.status === 'submitted') {
      return badRequest('A quote has already been submitted for this RFQ and cannot be changed');
    }

    const body = await request.json();
    const { formData, lineItems, notes } = body as {
      formData?: Record<string, unknown>;
      lineItems?: Array<{
        itemId: string;
        itemDescription: string;
        quantity: number;
        canSupply?: string;
        unitPrice: number | null;
        currency?: string;
        quotedUom?: string;
        availableQty?: number | null;
        committedQty?: number;
        leadTimeDays?: number | null;
        moq?: number | null;
        totalPrice: number | null;
      }>;
      notes?: string;
    };

    if (!formData) return badRequest('formData is required');
    if (!lineItems || lineItems.length === 0) {
      return badRequest('At least one line item is required');
    }
    for (const li of lineItems) {
      if (
        li.unitPrice != null &&
        (typeof li.unitPrice !== 'number' || li.unitPrice < 0 || Number.isNaN(li.unitPrice))
      ) {
        return badRequest(`Invalid unit price for "${li.itemDescription}"`);
      }
    }
    const anyPriced = lineItems.some(
      (li) => li.canSupply !== 'no' && li.unitPrice != null && li.unitPrice > 0
    );
    if (!anyPriced) {
      return badRequest('At least one line item must be priced');
    }

    // Rough headline total in the RFQ currency; the comparison normalises
    // UoM/currency itself. Only lines quoted in the RFQ currency contribute.
    const rfqDoc = ctx.rfq.rfqDocument
      ? normalizeRFQDocument(ctx.rfq.rfqDocument, {
          rfqId: ctx.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : null;
    const rfqCurrency = rfqDoc?.header.currency || 'INR';
    const totalAmount = lineItems.reduce(
      (sum, li) => sum + (li.totalPrice != null && (li.currency ?? rfqCurrency) === rfqCurrency ? li.totalPrice : 0),
      0
    );

    const [submission] = await db
      .insert(quoteSubmissions)
      .values({
        rfqInvitationId: ctx.invitation.id,
        formData,
        lineItems,
        totalAmount,
        currency: rfqCurrency,
        notes: notes ?? null,
      })
      .returning();

    await db
      .update(rfqInvitations)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(eq(rfqInvitations.id, ctx.invitation.id));

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
