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
import { draftFromSubmission, groupComments } from '@/lib/quote-negotiation';
import { sendQuoteNegotiationEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Send the current round of comments to the supplier as a review or
 * negotiation request. Flips the invitation to 'negotiating', seeds an
 * editable draft from the submitted quote, and emails the supplier.
 * See REQUIREMENT_quote-negotiation.md.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id, invitationId } = await params;

    const body = await request.json();
    const intent = (body?.intent === 'negotiation' ? 'negotiation' : 'review') as
      | 'review'
      | 'negotiation';

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

    // Stamp the round's comments as sent.
    await db
      .update(quoteComments)
      .set({ status: 'sent', intent, sentAt: now })
      .where(
        and(
          eq(quoteComments.rfqInvitationId, invitationId),
          eq(quoteComments.status, 'open')
        )
      );

    // Flip the invitation so the supplier link reopens editable.
    await db
      .update(rfqInvitations)
      .set({ status: 'negotiating' })
      .where(eq(rfqInvitations.id, invitationId));

    // Seed the editable draft from the submitted quote.
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

    // Email the supplier.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const lineLabels: Record<string, string> = {};
    lineItems.forEach((li, i) => {
      lineLabels[li.id] = `Line ${i + 1} — ${li.itemDescription}`;
    });
    const groups = groupComments(
      openComments.map((c) => ({
        fieldId: c.fieldId,
        fieldLabel: c.fieldLabel,
        quotedValue: c.quotedValue,
        comment: c.comment,
      })),
      lineLabels
    );

    const emailRes = await sendQuoteNegotiationEmail(
      {
        to: row.supplier.contactEmail,
        supplierName: row.supplier.companyName,
        rfqTitle: row.rfq.title,
        rfqId: row.rfq.id,
        token: row.invitation.token,
        formLink: `${appUrl}/quote/${row.invitation.token}`,
        intent,
        round,
        groups,
      },
      invitationId
    );

    return NextResponse.json({
      ok: true,
      intent,
      round,
      sent: openComments.length,
      emailSent: emailRes.success,
      emailError: emailRes.success ? undefined : emailRes.error,
    });
  } catch (error) {
    return serverError(error);
  }
}
