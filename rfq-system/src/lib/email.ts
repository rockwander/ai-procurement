import { Resend } from 'resend';
import { db } from '@/db';
import { emailLogs } from '@/db/schema';

const FROM_EMAIL = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// ---------------------------------------------------------------------------
// Subject-line token marker
//
// A supplier can respond to an RFQ by simply replying to the invitation email
// (see REQUIREMENT_quote-via-email.md). The inbound webhook matches the reply
// to an invitation by a machine-readable marker in the subject, which the mail
// client preserves on "Re:". Format: "  [ref: <rfqId> / <token>]".
// ---------------------------------------------------------------------------

const REF_MARKER_RE = /\[ref:\s*([0-9a-fA-F-]{8,})\s*\/\s*([0-9a-f]{16,})\s*\]/;

export function refMarker(rfqId: string, token: string): string {
  return `[ref: ${rfqId} / ${token}]`;
}

export function subjectWithRef(base: string, rfqId: string, token: string): string {
  return `${base}  ${refMarker(rfqId, token)}`;
}

/** Pull the invitation token out of a (possibly "Re:"-prefixed) subject line. */
export function parseRefMarker(subject: string): { rfqId: string; token: string } | null {
  const m = REF_MARKER_RE.exec(subject || '');
  if (!m) return null;
  return { rfqId: m[1], token: m[2] };
}

// Lazy: don't construct the Resend client at module load — it throws when
// RESEND_API_KEY is absent, which breaks `next build` page-data collection.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || 're_missing_key');
  }
  return _resend;
}
const resend = new Proxy({} as Resend, {
  get(_t, prop, receiver) {
    return Reflect.get(getResend() as object, prop, receiver);
  },
});

export interface SendRFQEmailParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  rfqSummary: string;
  formLink: string;
  pdfAttachment?: {
    filename: string;
    content: Buffer;
  };
  deadline?: string;
  /** rfq id + invitation token — appended to the subject as a reply marker */
  rfqId: string;
  token: string;
}

export interface SendReminderEmailParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  formLink: string;
  deadline?: string;
  daysRemaining?: number;
  rfqId: string;
  token: string;
}

export interface SendPOEmailParams {
  to: string;
  supplierName: string;
  poNumber: string;
  totalAmount: number;
  pdfAttachment: {
    filename: string;
    content: Buffer;
  };
}

// Send RFQ Invitation Email
export async function sendRFQEmail(params: SendRFQEmailParams, rfqId?: string, invitationId?: string) {
  try {
    const subject = subjectWithRef(`RFQ: ${params.rfqTitle}`, params.rfqId, params.token);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Request for Quotation</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <p>You have been invited to submit a quote for the following RFQ:</p>

            <h2>${params.rfqTitle}</h2>

            <p>${params.rfqSummary}</p>

            ${params.deadline ? `<p><strong>Deadline:</strong> ${new Date(params.deadline).toLocaleDateString()}</p>` : ''}

            <p>You can respond in either of two ways:</p>
            <ol>
              <li><strong>Open the link</strong> below — an AI assistant helps you
                build your quotation and shows a live preview; or</li>
              <li><strong>Reply to this email</strong> — attach your quotation
                (PDF, price list, spreadsheet as PDF, spec sheet — any readable
                format) and/or write your prices in the reply. We'll read it and
                email you back confirming what was captured and whether anything
                still needs your attention.</li>
            </ol>

            <p style="text-align: center;">
              <a href="${params.formLink}" class="button">Open quotation</a>
            </p>

            <p><strong>Please keep the subject line unchanged when you reply</strong>
              — it carries a reference we use to match your response to this RFQ.</p>

            <p>If you have any questions, please contact our procurement team.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
          <div class="footer">
            <p>Replying to this email is fine. Keep the subject line intact so we
              can match your quotation to the right RFQ.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailData: any = {
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    };

    if (params.pdfAttachment) {
      emailData.attachments = [
        {
          filename: params.pdfAttachment.filename,
          content: params.pdfAttachment.content,
        },
      ];
    }

    const { data, error } = await resend.emails.send(emailData);

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'rfq_invitation',
      rfqId,
      rfqInvitationId: invitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: params.pdfAttachment
        ? [{ filename: params.pdfAttachment.filename, bytes: params.pdfAttachment.content.length }]
        : [],
    });

    if (error) {
      console.error('Failed to send RFQ email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ RFQ email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending RFQ email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send Reminder Email
export async function sendReminderEmail(params: SendReminderEmailParams, invitationId?: string) {
  try {
    const subject = subjectWithRef(
      `Reminder: RFQ Quote Submission - ${params.rfqTitle}`,
      params.rfqId,
      params.token
    );

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .urgent { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ RFQ Reminder</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <div class="urgent">
              <strong>Reminder:</strong> You have not yet submitted your quote for:<br>
              <strong>${params.rfqTitle}</strong>
            </div>

            ${params.daysRemaining ? `<p><strong>${params.daysRemaining} day${params.daysRemaining > 1 ? 's' : ''} remaining</strong> to submit your quote.</p>` : ''}

            ${params.deadline ? `<p><strong>Deadline:</strong> ${new Date(params.deadline).toLocaleDateString()}</p>` : ''}

            <p style="text-align: center;">
              <a href="${params.formLink}" class="button">Submit Quote Now</a>
            </p>

            <p>Don't miss this opportunity. Submit your quote before the deadline.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'reminder',
      rfqInvitationId: invitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: [],
    });

    if (error) {
      console.error('Failed to send reminder email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Reminder email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Send Purchase Order Email
export async function sendPOEmail(params: SendPOEmailParams, poId?: string) {
  try {
    const subject = `Purchase Order ${params.poNumber}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .highlight { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Purchase Order Issued</h1>
          </div>
          <div class="content">
            <p>Dear ${params.supplierName},</p>

            <p>Congratulations! Your quote has been selected.</p>

            <div class="highlight">
              <strong>Purchase Order Number:</strong> ${params.poNumber}<br>
              <strong>Total Amount:</strong> $${params.totalAmount.toFixed(2)}
            </div>

            <p>Please find the complete purchase order attached to this email (PDF).</p>

            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Review the purchase order details</li>
              <li>Confirm acceptance within 48 hours</li>
              <li>Begin order fulfillment as per agreed terms</li>
            </ol>

            <p>Thank you for your partnership.</p>

            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
      attachments: [
        {
          filename: params.pdfAttachment.filename,
          content: params.pdfAttachment.content,
        },
      ],
    });

    // Log email
    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'purchase_order',
      purchaseOrderId: poId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: [{ filename: params.pdfAttachment.filename, bytes: params.pdfAttachment.content.length }],
    });

    if (error) {
      console.error('Failed to send PO email:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ PO email sent to ${params.to}`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending PO email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Quote acknowledgement — reply to a supplier who responded by email
// (REQUIREMENT_quote-via-email.md §5)
// ---------------------------------------------------------------------------

export interface QuoteAckBlockerGroup {
  heading: string;
  items: string[];
}
export interface QuoteAckLowConfidence {
  label: string;
  value: string;
  rationale: string;
}

export interface SendQuoteAckParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  rfqId: string;
  token: string;
  formLink: string;
  /** subject of the email the supplier sent, so we can reply "Re: …" and keep the marker */
  inReplySubject: string;
  outcome: 'submitted' | 'blocked' | 'verify';
  blockers: QuoteAckBlockerGroup[];
  lowConfidence: QuoteAckLowConfidence[];
  /** attachment filenames we could not read */
  unreadableAttachments: string[];
}

export async function sendQuoteAckEmail(
  params: SendQuoteAckParams,
  rfqInvitationId?: string
) {
  try {
    const baseSubject = params.inReplySubject.replace(/^\s*(re:\s*)+/i, '').trim();
    const subject = `Re: ${
      baseSubject.includes('[ref:')
        ? baseSubject
        : subjectWithRef(baseSubject || `RFQ: ${params.rfqTitle}`, params.rfqId, params.token)
    }`;

    const headline =
      params.outcome === 'submitted'
        ? { color: '#10b981', text: 'Your quotation has been submitted' }
        : params.outcome === 'blocked'
        ? { color: '#dc2626', text: 'Your quotation has NOT been submitted' }
        : { color: '#f59e0b', text: 'Your quotation is ready but NOT yet submitted' };

    const blockerHtml = params.blockers.length
      ? `<h3 style="margin-bottom:6px;">Still needed</h3><ul>${params.blockers
          .map(
            (g) =>
              `<li><strong>${g.heading}:</strong> ${g.items.length} — ${g.items
                .map((i) => escapeHtml(i))
                .join('; ')}</li>`
          )
          .join('')}</ul>`
      : '';

    const verifyHtml = params.lowConfidence.length
      ? `<h3 style="margin-bottom:6px;">Please verify</h3><ul>${params.lowConfidence
          .map(
            (l) =>
              `<li><strong>${escapeHtml(l.label)}</strong> — we have <em>${escapeHtml(
                l.value
              )}</em> (${escapeHtml(l.rationale)})</li>`
          )
          .join('')}</ul>`
      : '';

    const unreadableHtml = params.unreadableAttachments.length
      ? `<p style="color:#b45309;">We could not read: ${params.unreadableAttachments
          .map((a) => `<code>${escapeHtml(a)}</code>`)
          .join(', ')}. Please attach these as PDF, or enter the values at the link.</p>`
      : '';

    const bodyIntro =
      params.outcome === 'submitted'
        ? `<p>We read your email and everything needed was present and clear. Your
             quotation for <strong>${escapeHtml(params.rfqTitle)}</strong> is now
             recorded and <strong>locked</strong> — it cannot be changed. You can
             review exactly what was submitted at the link below.</p>`
        : params.outcome === 'blocked'
        ? `<p>We read your email but some required information is still missing.
             Your quotation will not be considered until you open the link below,
             fill in the items listed, and press <strong>Submit</strong>.</p>`
        : `<p>We filled in everything from your email, but a few values are
             assumptions we need you to confirm. Open the link below, check the
             highlighted fields, and press <strong>Submit</strong>.</p>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${headline.color}; color: white; padding: 18px; text-align: center; }
          .content { background: #f9fafb; padding: 28px; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 18px 0; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2 style="margin:0;">${headline.text}</h2></div>
          <div class="content">
            <p>Dear ${escapeHtml(params.supplierName)},</p>
            ${bodyIntro}
            ${unreadableHtml}
            ${blockerHtml}
            ${verifyHtml}
            <p style="text-align:center;">
              <a href="${params.formLink}" class="button">Open your quotation (preview + AI assistant)</a>
            </p>
            <p>You can reply to this email again with corrections — keep the
              subject line unchanged so we can match it.</p>
            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });

    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'quote_ack',
      rfqId: params.rfqId,
      rfqInvitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: [],
    });

    if (error) {
      console.error('Failed to send quote-ack email:', error);
      return { success: false, error: error.message };
    }
    console.log(`✅ Quote-ack email sent to ${params.to} (${params.outcome})`);
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending quote-ack email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Quote review / negotiation — the buyer sends a submitted quote back with
// per-field comments for the supplier to address. Same mechanics for both;
// only the copy differs (`intent`). See REQUIREMENT_quote-negotiation.md.
// ---------------------------------------------------------------------------

export interface QuoteCommentGroup {
  /** e.g. "Line 3 — Corrugated box" or "Commercial terms" */
  heading: string;
  items: Array<{
    /** field anchor label, e.g. "Unit price" */
    label: string;
    /** what the supplier had quoted, if any */
    quotedValue?: string | null;
    /** the buyer's note */
    comment: string;
  }>;
}

export interface SendQuoteNegotiationParams {
  to: string;
  supplierName: string;
  rfqTitle: string;
  rfqId: string;
  token: string;
  formLink: string;
  intent: 'review' | 'negotiation';
  round: number;
  groups: QuoteCommentGroup[];
}

export async function sendQuoteNegotiationEmail(
  params: SendQuoteNegotiationParams,
  rfqInvitationId?: string
) {
  try {
    const copy =
      params.intent === 'negotiation'
        ? {
            base: `Let's discuss your quotation — ${params.rfqTitle}`,
            headerColor: '#7c3aed',
            headline: 'We would like to revise a few points',
            intro: `Thank you for your quotation for <strong>${escapeHtml(
              params.rfqTitle
            )}</strong>. Before we proceed we would like to revise the points
              below. Please open your quotation at the link, make any changes you
              can, and resubmit.`,
          }
        : {
            base: `Clarifications on your quotation — ${params.rfqTitle}`,
            headerColor: '#2563eb',
            headline: 'A few points need your attention',
            intro: `We have reviewed your quotation for <strong>${escapeHtml(
              params.rfqTitle
            )}</strong> and need clarification or completion on the points below.
              Please open your quotation at the link, address them, and resubmit.`,
          };

    const subject = subjectWithRef(copy.base, params.rfqId, params.token);

    const groupsHtml = params.groups
      .map(
        (g) => `
          <h3 style="margin:18px 0 6px;">${escapeHtml(g.heading)}</h3>
          <ul>
            ${g.items
              .map(
                (it) =>
                  `<li style="margin-bottom:6px;"><strong>${escapeHtml(
                    it.label
                  )}</strong>${
                    it.quotedValue != null && it.quotedValue !== ''
                      ? ` — you quoted <em>${escapeHtml(String(it.quotedValue))}</em>`
                      : ''
                  }<br>${escapeHtml(it.comment)}</li>`
              )
              .join('')}
          </ul>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${copy.headerColor}; color: white; padding: 18px; text-align: center; }
          .content { background: #f9fafb; padding: 28px; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 18px 0; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2 style="margin:0;">${copy.headline}</h2></div>
          <div class="content">
            <p>Dear ${escapeHtml(params.supplierName)},</p>
            <p>${copy.intro}</p>
            ${groupsHtml}
            <p style="text-align:center;">
              <a href="${params.formLink}" class="button">Open &amp; revise your quotation</a>
            </p>
            <p>Once you resubmit, your quotation is locked again. You can also
              reply to this email with your changes — keep the subject line
              unchanged so we can match it.</p>
            <p>Best regards,<br>Procurement Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });

    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: params.intent === 'negotiation' ? 'quote_negotiation' : 'quote_review',
      rfqId: params.rfqId,
      rfqInvitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: [],
    });

    if (error) {
      console.error('Failed to send quote-negotiation email:', error);
      return { success: false, error: error.message };
    }
    console.log(
      `✅ Quote-${params.intent} email sent to ${params.to} (round ${params.round})`
    );
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending quote-negotiation email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface SendQuoteRevisedParams {
  /** the buyer's email */
  to: string;
  buyerName: string;
  supplierName: string;
  rfqTitle: string;
  rfqId: string;
  /** link to the comparison / quote-detail page */
  reviewLink: string;
  round: number;
}

/** Notify the buyer that a supplier resubmitted after a review / negotiation round. */
export async function sendQuoteRevisedEmail(
  params: SendQuoteRevisedParams,
  rfqInvitationId?: string
) {
  try {
    const subject = `Revised quotation from ${params.supplierName} — ${params.rfqTitle}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 18px; text-align: center; }
          .content { background: #f9fafb; padding: 28px; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 18px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2 style="margin:0;">Revised quotation received</h2></div>
          <div class="content">
            <p>Hi ${escapeHtml(params.buyerName)},</p>
            <p><strong>${escapeHtml(params.supplierName)}</strong> has submitted a
              revised quotation for <strong>${escapeHtml(params.rfqTitle)}</strong>
              (round ${params.round}). Their earlier comments have been marked
              addressed. The quotation is locked again.</p>
            <p style="text-align:center;">
              <a href="${params.reviewLink}" class="button">Review the revised quotation</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html,
    });

    await db.insert(emailLogs).values({
      recipientEmail: params.to,
      subject,
      type: 'quote_revised',
      rfqId: params.rfqId,
      rfqInvitationId,
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
      attachments: [],
    });

    if (error) {
      console.error('Failed to send quote-revised email:', error);
      return { success: false, error: error.message };
    }
    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Error sending quote-revised email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * A bare "Re:" reply with no template — used for the "we couldn't match your
 * email" / "sender mismatch" guidance messages. Logged so it shows in the
 * Supplier Mailbox simulator.
 */
export async function sendPlainReply(to: string, inReplySubject: string, message: string) {
  try {
    const base = inReplySubject.replace(/^\s*(re:\s*)+/i, '').trim();
    const subject = `Re: ${base || 'Your RFQ response'}`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
      <p>${escapeHtml(message)}</p><p>Best regards,<br>Procurement Team</p></body></html>`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    await db.insert(emailLogs).values({
      recipientEmail: to,
      subject,
      type: 'quote_ack',
      status: error ? 'failed' : 'sent',
      externalId: data?.id,
      errorMessage: error?.message,
      bodyHtml: html,
    });
    return { success: !error };
  } catch (error) {
    console.error('Error sending plain reply:', error);
    return { success: false };
  }
}
