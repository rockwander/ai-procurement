import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emailLogs, rfqInvitations, suppliers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, badRequest, notFound, serverError } from '@/lib/api';
import { parseRefMarker } from '@/lib/email';
import { extractText, isSupportedDoc } from '@/lib/doc-extract';
import { processInboundEmail } from '@/lib/quote-inbound';
import type { InboundEmailPayload } from '@/lib/inbound-email';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POC Supplier Mailbox: the buyer composes a reply "as the supplier" to one of
// the outbound emails. We build the same payload shape the Resend inbound
// webhook would deliver and run it through the shared processor — no signature
// check (this is a trusted, authed, in-app call). The "from" address is forced
// to the supplier's real contactEmail so the identity check behaves exactly as
// it would for a genuine reply.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const form = await request.formData();
    const emailLogId = String(form.get('emailLogId') ?? '');
    const bodyText = String(form.get('body') ?? '');
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (!emailLogId) return badRequest('emailLogId is required');

    const [log] = await db.select().from(emailLogs).where(eq(emailLogs.id, emailLogId));
    if (!log) return notFound('Email not found');

    const ref = parseRefMarker(log.subject);
    if (!ref) return badRequest('That email has no RFQ reference — cannot reply to it');
    if (!log.rfqInvitationId) return badRequest('That email is not tied to an invitation');

    const [row] = await db
      .select({ invitation: rfqInvitations, supplier: suppliers })
      .from(rfqInvitations)
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .where(eq(rfqInvitations.id, log.rfqInvitationId));
    if (!row) return notFound('Invitation not found');

    // Build attachments as base64, exactly as Resend inbound would.
    const attachments: NonNullable<InboundEmailPayload['attachments']> = [];
    const skipped: string[] = [];
    for (const file of files) {
      if (!isSupportedDoc(file.name)) {
        skipped.push(file.name);
        // still forward it so the "unreadable attachment" path is exercised
        attachments.push({ filename: file.name, content: '', contentType: file.type });
        continue;
      }
      const buf = Buffer.from(await file.arrayBuffer());
      attachments.push({
        filename: file.name,
        content: buf.toString('base64'),
        contentType: file.type || 'application/octet-stream',
      });
      // sanity: make sure we can read it (not required, just nicer errors)
      try {
        await extractText(file.name, buf);
      } catch {
        skipped.push(file.name);
      }
    }

    const payload: InboundEmailPayload = {
      from: row.supplier.contactEmail,
      to: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      subject: log.subject.startsWith('Re:') ? log.subject : `Re: ${log.subject}`,
      text: bodyText,
      attachments,
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    // Record the supplier's outgoing reply in the mailbox too, so the thread
    // reads naturally (their message, then the system's ack).
    await db.insert(emailLogs).values({
      recipientEmail: payload.to as string,
      subject: payload.subject!,
      type: 'quote_ack', // closest existing bucket; shown as "from supplier" in the UI
      rfqId: row.invitation.rfqId,
      rfqInvitationId: row.invitation.id,
      status: 'sent',
      bodyHtml: `<p><em>From ${escapeHtml(row.supplier.contactEmail)} (simulated supplier reply)</em></p>
        <pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(bodyText || '(no message)')}</pre>`,
      attachments: attachments.map((a) => ({ filename: a.filename, bytes: a.content ? a.content.length : 0 })),
    });

    const result = await processInboundEmail(payload, appUrl);

    return NextResponse.json({ result, skipped });
  } catch (error) {
    return serverError(error);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
