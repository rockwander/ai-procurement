import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  rfqs,
  rfqLineItems,
  rfqInvitations,
  quoteComments,
  quoteSubmissions,
  quoteDrafts,
  suppliers,
} from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { normalizeRFQDocument } from '@/lib/rfq-document';
import type { RFQLineForResponse } from '@/lib/line-response';
import { draftFromSubmission, orderComments } from '@/lib/quote-negotiation';
import { sendQuoteNegotiationEmail, type QuoteCommentItem } from '@/lib/email';
import { QuoteCommentAgent } from '@/lib/agents/quote-comment';

export const runtime = 'nodejs';
export const maxDuration = 45;

/**
 * Send the current round of comments to the supplier. An AI pass classifies
 * each comment as a clarification (review) or a terms-change request
 * (negotiation) and drafts the outbound copy; the round is stamped, the
 * invitation flips to 'negotiating', an editable draft is seeded from the
 * submission, and the supplier is emailed. See REQUIREMENT_quote-negotiation.md.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id, invitationId } = await params;

    const [row] = await db
      .select({ invitation: rfqInvitations, supplier: suppliers, rfq: rfqs })
      .from(rfqInvitations)
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .innerJoin(rfqs, eq(rfqInvitations.rfqId, rfqs.id))
      .where(and(eq(rfqInvitations.id, invitationId), eq(rfqInvitations.rfqId, id)));
    if (!row) return notFound('Invitation not found');

    if (!['submitted', 'negotiating'].includes(row.invitation.status)) {
      return badRequest('This supplier has no submitted quote to send back');
    }

    const [submission] = await db
      .select()
      .from(quoteSubmissions)
      .where(eq(quoteSubmissions.rfqInvitationId, invitationId));
    if (!submission) return badRequest('No submission found for this invitation');

    const openComments = await db
      .select()
      .from(quoteComments)
      .where(
        and(
          eq(quoteComments.rfqInvitationId, invitationId),
          eq(quoteComments.status, 'open')
        )
      )
      .orderBy(asc(quoteComments.createdAt));

    if (openComments.length === 0) {
      return badRequest('Add at least one comment before sending');
    }

    const round = openComments[0].round;
    const now = new Date();

    const lineItems = await db
      .select()
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, id))
      .orderBy(asc(rfqLineItems.orderIndex));
    const lines: RFQLineForResponse[] = lineItems.map((li) => ({
      id: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity,
      unit: li.unit,
    }));
    const rfqDoc = row.rfq.rfqDocument
      ? normalizeRFQDocument(row.rfq.rfqDocument, {
          rfqId: row.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : null;
    const rfqCurrency = rfqDoc?.header.currency || 'INR';

    // ---- AI: classify each comment + draft the copy ------------------------
    const agent = new QuoteCommentAgent();
    const cls = await agent.classifyAndDraft(
      {
        rfqTitle: row.rfq.title,
        supplierName: row.supplier.companyName,
        buyerName: user.name || 'the buyer',
        comments: openComments.map((c) => ({
          id: c.id,
          fieldLabel: c.fieldLabel,
          quotedValue: c.quotedValue,
          comment: c.comment,
        })),
      },
      id
    );

    const classificationFailed = !cls.success || !cls.data;
    const intentById = new Map<string, 'review' | 'negotiation'>();
    if (cls.success && cls.data) {
      for (const c of cls.data.classified) intentById.set(c.id, c.intent);
    }
    // Fallback: everything is a review item.
    for (const c of openComments) {
      if (!intentById.has(c.id)) intentById.set(c.id, 'review');
    }

    const hasNeg = [...intentById.values()].includes('negotiation');
    const hasRev = [...intentById.values()].includes('review');
    const roundKind: 'review' | 'negotiation' | 'both' =
      hasNeg && hasRev ? 'both' : hasNeg ? 'negotiation' : 'review';

    // ---- Persist: stamp each comment with its own intent ------------------
    for (const c of openComments) {
      await db
        .update(quoteComments)
        .set({ status: 'sent', intent: intentById.get(c.id)!, sentAt: now })
        .where(eq(quoteComments.id, c.id));
    }

    await db
      .update(rfqInvitations)
      .set({ status: 'negotiating' })
      .where(eq(rfqInvitations.id, invitationId));

    // ---- Seed the editable draft from the submitted quote ----------------
    const draft = draftFromSubmission(
      lines,
      {
        lineItems: submission.lineItems,
        formData: submission.formData,
        notes: submission.notes,
      },
      rfqCurrency
    );

    await db
      .insert(quoteDrafts)
      .values({
        rfqInvitationId: invitationId,
        lineResponses: draft.lineResponses,
        formData: draft.formData,
        notes: draft.notes || null,
        provenance: draft.provenance,
        source: 'link',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: quoteDrafts.rfqInvitationId,
        set: {
          lineResponses: draft.lineResponses,
          formData: draft.formData,
          notes: draft.notes || null,
          provenance: draft.provenance,
          source: 'link',
          updatedAt: now,
        },
      });

    // ---- Email the supplier ---------------------------------------------
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const lineOrder = lineItems.map((li) => li.id);
    const lineLabel: Record<string, string> = {};
    lineItems.forEach((li, i) => {
      lineLabel[li.id] = `Line ${i + 1} — ${li.itemDescription}`;
    });
    const prettyLabel = (fieldId: string, fallback: string): string => {
      const m = /^line:([^:]+):/.exec(fieldId) || /^line:([^:]+)$/.exec(fieldId);
      if (m && lineLabel[m[1]]) {
        // keep the field part after the em-dash if the stored label has one
        const tail = fallback.replace(/^Line\s+\d+\s+—\s+/, '');
        return `${lineLabel[m[1]]} · ${tail}`;
      }
      return fallback;
    };

    const ordered = orderComments(
      openComments.map((c) => ({
        fieldId: c.fieldId,
        fieldLabel: prettyLabel(c.fieldId, c.fieldLabel),
        quotedValue: c.quotedValue,
        comment: c.comment,
        _id: c.id,
      })),
      lineOrder
    );

    const reviewItems: QuoteCommentItem[] = [];
    const negotiationItems: QuoteCommentItem[] = [];
    for (const o of ordered) {
      const item: QuoteCommentItem = {
        label: o.label,
        quotedValue: o.quotedValue,
        comment: o.comment,
      };
      (intentById.get(o._id) === 'negotiation' ? negotiationItems : reviewItems).push(item);
    }

    const emailRes = await sendQuoteNegotiationEmail(
      {
        to: row.supplier.contactEmail,
        supplierName: row.supplier.companyName,
        rfqTitle: row.rfq.title,
        rfqId: row.rfq.id,
        token: row.invitation.token,
        formLink: `${appUrl}/quote/${row.invitation.token}`,
        round,
        roundKind,
        subject:
          cls.data?.email.subject ?? `Your quotation for ${row.rfq.title}`,
        headline:
          cls.data?.email.headline ??
          (roundKind === 'negotiation'
            ? 'We would like to revise a few points'
            : roundKind === 'both'
            ? 'A few clarifications and points to discuss'
            : 'A few points need your attention'),
        intro:
          cls.data?.email.intro ??
          'We have reviewed your quotation and need you to address the points below. Please open your quotation at the link, make any changes, and resubmit.',
        reviewItems,
        negotiationItems,
        classificationFailed,
      },
      invitationId
    );

    return NextResponse.json({
      ok: true,
      round,
      roundKind,
      sent: openComments.length,
      review: reviewItems.length,
      negotiation: negotiationItems.length,
      classificationFailed,
      emailSent: emailRes.success,
      emailError: emailRes.success ? undefined : emailRes.error,
    });
  } catch (error) {
    return serverError(error);
  }
}
