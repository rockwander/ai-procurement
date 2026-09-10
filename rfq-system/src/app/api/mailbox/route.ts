import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailLogs, rfqInvitations, suppliers, rfqs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';
import { parseRefMarker } from '@/lib/email';

const APP_ADDRESS = (process.env.EMAIL_FROM || 'onboarding@resend.dev').toLowerCase();

export const runtime = 'nodejs';

// POC "Supplier Mailbox": every outbound email, so the buyer can open one,
// reply as the supplier, and exercise the accept-quote-by-email flow without a
// real inbox. See REQUIREMENT_quote-via-email.md and /dashboard/mailbox.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const rows = await db
      .select({
        id: emailLogs.id,
        recipientEmail: emailLogs.recipientEmail,
        subject: emailLogs.subject,
        type: emailLogs.type,
        status: emailLogs.status,
        errorMessage: emailLogs.errorMessage,
        bodyHtml: emailLogs.bodyHtml,
        attachments: emailLogs.attachments,
        sentAt: emailLogs.sentAt,
        rfqInvitationId: emailLogs.rfqInvitationId,
        rfqTitle: rfqs.title,
        supplierName: suppliers.companyName,
        supplierEmail: suppliers.contactEmail,
        invitationStatus: rfqInvitations.status,
      })
      .from(emailLogs)
      .leftJoin(rfqInvitations, eq(emailLogs.rfqInvitationId, rfqInvitations.id))
      .leftJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .leftJoin(rfqs, eq(rfqInvitations.rfqId, rfqs.id))
      .orderBy(desc(emailLogs.sentAt))
      .limit(200);

    const emails = rows.map((r) => ({
      ...r,
      // Distinguish the simulated supplier's own outgoing reply (addressed to
      // the app) from mail the supplier received and could reply to.
      fromSupplier: r.recipientEmail.toLowerCase() === APP_ADDRESS,
      // An email a supplier can reply to: it carries the [ref:] marker, is tied
      // to a known invitation/supplier, was sent *to* the supplier, and is one
      // of the buyer→supplier types.
      canReply:
        !!parseRefMarker(r.subject) &&
        !!r.rfqInvitationId &&
        !!r.supplierEmail &&
        r.recipientEmail.toLowerCase() !== APP_ADDRESS &&
        (r.type === 'rfq_invitation' ||
          r.type === 'reminder' ||
          r.type === 'quote_ack' ||
          r.type === 'quote_review' ||
          r.type === 'quote_negotiation'),
    }));

    return NextResponse.json({ emails });
  } catch (error) {
    return serverError(error);
  }
}
