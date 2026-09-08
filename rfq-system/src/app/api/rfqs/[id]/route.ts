import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  rfqs,
  rfqLineItems,
  rfqDraftMessages,
  rfqDocumentVersions,
  rfqInvitations,
  quoteSubmissions,
  purchaseOrders,
  chatMessages,
  aiLogs,
  emailLogs,
} from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { applyRFQDocument } from '@/lib/rfq-persist';
import type { RFQDocument } from '@/lib/rfq-document';

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

/**
 * Update a draft RFQ.
 * - `rfqDocument`: a full document from the form builder — applied immediately
 *   (re-derives form schema + line items, snapshots as a 'manual' version).
 * - `deadline`: convenience field.
 */
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

    if (body.rfqDocument) {
      const applied = await applyRFQDocument(id, body.rfqDocument as RFQDocument, 'manual');
      const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
      return NextResponse.json({ rfq, rfqDocument: applied });
    }

    // Fallback: light metadata patch.
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === 'string') patch.title = body.title;
    if (typeof body.description === 'string') patch.description = body.description;
    if (body.deadline !== undefined) {
      patch.deadline = body.deadline ? new Date(body.deadline) : null;
    }
    const [rfq] = await db.update(rfqs).set(patch).where(eq(rfqs.id, id)).returning();
    return NextResponse.json({ rfq });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Delete an RFQ and everything that depends on it: draft chat, outline
 * versions, line items, invitations, quote submissions, supplier chat, the
 * purchase order(s), and all AI / email log rows that reference any of them.
 * Some of these FKs have no ON DELETE CASCADE, so the order matters.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [existing] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!existing) return notFound('RFQ not found');

    // Ids of the dependent rows we need for the log cleanup.
    const invitations = await db
      .select({ id: rfqInvitations.id })
      .from(rfqInvitations)
      .where(eq(rfqInvitations.rfqId, id));
    const invitationIds = invitations.map((i) => i.id);

    const pos = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.rfqId, id));
    const poIds = pos.map((p) => p.id);

    const counts = {
      invitations: invitationIds.length,
      purchaseOrders: poIds.length,
    };

    // --- logs first (no cascade; they point at rfq / invitation / PO) ---
    await db.delete(emailLogs).where(eq(emailLogs.rfqId, id));
    if (invitationIds.length) {
      await db.delete(emailLogs).where(inArray(emailLogs.rfqInvitationId, invitationIds));
    }
    if (poIds.length) {
      await db.delete(emailLogs).where(inArray(emailLogs.purchaseOrderId, poIds));
    }
    await db.delete(aiLogs).where(eq(aiLogs.rfqId, id));

    // --- quote submissions + supplier chat (cascade off rfqInvitations, but
    //     delete explicitly so we don't depend on it) ---
    if (invitationIds.length) {
      await db
        .delete(quoteSubmissions)
        .where(inArray(quoteSubmissions.rfqInvitationId, invitationIds));
      await db.delete(chatMessages).where(inArray(chatMessages.rfqInvitationId, invitationIds));
    }

    // --- purchase orders (no cascade) ---
    if (poIds.length) {
      await db.delete(purchaseOrders).where(eq(purchaseOrders.rfqId, id));
    }

    // --- invitations, line items, draft chat, versions (cascade, explicit) ---
    await db.delete(rfqInvitations).where(eq(rfqInvitations.rfqId, id));
    await db.delete(rfqLineItems).where(eq(rfqLineItems.rfqId, id));
    await db.delete(rfqDraftMessages).where(eq(rfqDraftMessages.rfqId, id));
    await db.delete(rfqDocumentVersions).where(eq(rfqDocumentVersions.rfqId, id));

    // --- the RFQ itself ---
    await db.delete(rfqs).where(eq(rfqs.id, id));

    return NextResponse.json({ deleted: true, ...counts });
  } catch (error) {
    return serverError(error);
  }
}
