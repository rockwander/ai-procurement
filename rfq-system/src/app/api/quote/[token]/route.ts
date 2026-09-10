import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqInvitations, quoteSubmissions, quoteComments, rfqs, users } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { normalizeRFQDocument, rfqDocumentToText, emptyRFQDocument } from '@/lib/rfq-document';
import { normaliseLineResponse, type RFQLineForResponse } from '@/lib/line-response';
import { deleteDraft } from '@/lib/quote-draft';
import { sendQuoteRevisedEmail } from '@/lib/email';

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

    const negotiating = ctx.invitation.status === 'negotiating';

    // In a review / negotiation round the supplier's quote is editable again;
    // load the buyer's sent comments so the page can pin them to the fields.
    const sentComments = negotiating
      ? await db
          .select()
          .from(quoteComments)
          .where(
            and(
              eq(quoteComments.rfqInvitationId, ctx.invitation.id),
              eq(quoteComments.status, 'sent')
            )
          )
          .orderBy(asc(quoteComments.createdAt))
      : [];
    const latestRound = sentComments.reduce((m, c) => Math.max(m, c.round), 0);
    const roundComments = sentComments.filter((c) => c.round === latestRound);

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
        terms: rfqDoc.termsAndConditions ?? [],
        header: {
          buyer: rfqDoc.header.buyer,
          expectedDelivery: rfqDoc.header.expectedDelivery,
          validity: rfqDoc.header.validity,
        },
      },
      supplier: { companyName: ctx.supplier.companyName },
      formSchema: ctx.rfq.formSchema,
      lineItems: ctx.lineItems.map((li) => ({
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unit: li.unit,
      })),
      // `submitted` means locked. A quote in a review / negotiation round is
      // NOT locked — the supplier edits and resubmits.
      submitted: ctx.invitation.status === 'submitted',
      submission:
        ctx.submission && !negotiating
          ? {
              formData: ctx.submission.formData,
              lineItems: ctx.submission.lineItems,
              exceptions: ctx.submission.exceptions ?? [],
              submittedAt: ctx.submission.submittedAt,
            }
          : null,
      // The buyer sent the submitted quote back with comments to address.
      negotiation: negotiating
        ? {
            intent: roundComments[0]?.intent ?? 'review',
            round: latestRound,
            comments: roundComments.map((c) => ({
              fieldId: c.fieldId,
              fieldLabel: c.fieldLabel,
              quotedValue: c.quotedValue,
              comment: c.comment,
              intent: c.intent,
            })),
          }
        : null,
      // In-progress quote persisted server-side (seeded from an email response,
      // or from the submitted quote when a negotiation round opens). The page
      // seeds its state from this when there's no active submission.
      draft:
        ctx.invitation.status !== 'submitted' && ctx.draft
          ? {
              lineResponses: ctx.draft.lineResponses,
              formData: ctx.draft.formData,
              notes: ctx.draft.notes ?? '',
              provenance: ctx.draft.provenance,
              source: ctx.draft.source,
            }
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

    // A resubmit after a review / negotiation round: update the existing
    // submission in place (bump revision) rather than inserting a new one.
    const isRevision = ctx.invitation.status === 'negotiating' && !!ctx.submission;

    const body = await request.json();
    const { formData, lineItems, notes, exceptions } = body as {
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
      exceptions?: Array<{ re: string; comment: string }>;
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

    const cleanExceptions = Array.isArray(exceptions)
      ? exceptions
          .map((e) => ({ re: String(e?.re ?? '').trim(), comment: String(e?.comment ?? '').trim() }))
          .filter((e) => e.comment.length > 0)
      : [];

    const now = new Date();
    let submission;
    if (isRevision && ctx.submission) {
      [submission] = await db
        .update(quoteSubmissions)
        .set({
          formData,
          lineItems,
          totalAmount,
          currency: rfqCurrency,
          notes: notes ?? null,
          exceptions: cleanExceptions,
          revision: (ctx.submission.revision ?? 0) + 1,
          revisedAt: now,
        })
        .where(eq(quoteSubmissions.id, ctx.submission.id))
        .returning();

      // The comments for the latest sent round have been addressed.
      await db
        .update(quoteComments)
        .set({ status: 'addressed' })
        .where(
          and(
            eq(quoteComments.rfqInvitationId, ctx.invitation.id),
            eq(quoteComments.status, 'sent')
          )
        );
    } else {
      [submission] = await db
        .insert(quoteSubmissions)
        .values({
          rfqInvitationId: ctx.invitation.id,
          formData,
          lineItems,
          totalAmount,
          currency: rfqCurrency,
          notes: notes ?? null,
          exceptions: cleanExceptions,
        })
        .returning();
    }

    await db
      .update(rfqInvitations)
      .set({ status: 'submitted', submittedAt: now })
      .where(eq(rfqInvitations.id, ctx.invitation.id));

    // The draft has served its purpose.
    await deleteDraft(ctx.invitation.id);

    // Tell the buyer a revised quote landed.
    if (isRevision) {
      try {
        const [rfqRow] = await db
          .select({ createdBy: rfqs.createdBy, title: rfqs.title })
          .from(rfqs)
          .where(eq(rfqs.id, ctx.rfq.id));
        const [buyer] = rfqRow
          ? await db
              .select({ email: users.email, name: users.name })
              .from(users)
              .where(eq(users.id, rfqRow.createdBy))
          : [];
        if (buyer?.email) {
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
          await sendQuoteRevisedEmail(
            {
              to: buyer.email,
              buyerName: buyer.name || 'there',
              supplierName: ctx.supplier.companyName,
              rfqTitle: ctx.rfq.title,
              rfqId: ctx.rfq.id,
              reviewLink: `${appUrl}/dashboard/rfqs/${ctx.rfq.id}/quotes/${ctx.invitation.id}`,
              round: submission.revision,
            },
            ctx.invitation.id
          );
        }
      } catch (e) {
        console.error('revised-quote notification failed', e);
      }
    }

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
