// Core of "accept a quotation from an inbound email" — shared by the real
// Resend webhook (src/app/api/quote/inbound) and the in-app Supplier Mailbox
// simulator (src/app/api/dev/mailbox/reply). See REQUIREMENT_quote-via-email.md.

import { db } from '@/db';
import { rfqs, users, rfqInvitations, quoteSubmissions, quoteComments, chatMessages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { loadQuoteContext } from '@/lib/quote-access';
import { normalizeRFQDocument } from '@/lib/rfq-document';
import { AutofillAgent, type AutofillLineItem } from '@/lib/agents/autofill';
import { applyAgentPatches, inferNoBidForUncoveredLines } from '@/lib/line-response-status';
import type { FormSchema } from '@/lib/form-schema';
import { committedQty, type RFQLineForResponse } from '@/lib/line-response';
import { parseInboundEmail, type InboundEmailPayload } from '@/lib/inbound-email';
import {
  seedDraftState,
  mergePatchesIntoDraft,
  saveDraft,
  deleteDraft,
} from '@/lib/quote-draft';
import { assessQuoteAck, groupBlockers } from '@/lib/quote-ack';
import { sendQuoteAckEmail, sendPlainReply, sendQuoteRevisedEmail } from '@/lib/email';

export type InboundResult =
  | { status: 'no-ref' }
  | { status: 'unknown-token' }
  | { status: 'sender-mismatch' }
  | { status: 'already-submitted' }
  | { status: 'submitted' }
  | { status: 'draft-blocked' }
  | { status: 'draft-verify' };

/**
 * Process one inbound supplier email end to end: match it to an invitation,
 * run the Autofill agent over the body + attachments, merge into the draft,
 * decide submit-vs-draft, and email the supplier back.
 */
export async function processInboundEmail(
  payload: InboundEmailPayload,
  appUrl: string
): Promise<InboundResult> {
  const parsed = await parseInboundEmail(payload);

  // ---- Match to an invitation -----------------------------------------
  if (!parsed.ref) {
    await replyUnmatched(parsed.sender, parsed.subject, appUrl);
    return { status: 'no-ref' };
  }

  const ctx = await loadQuoteContext(parsed.ref.token);
  if (!ctx) {
    await replyUnmatched(parsed.sender, parsed.subject, appUrl);
    return { status: 'unknown-token' };
  }

  const invitedEmail = ctx.supplier.contactEmail.trim().toLowerCase();
  if (parsed.sender !== invitedEmail) {
    await replyMismatch(parsed.sender, parsed.subject, appUrl);
    return { status: 'sender-mismatch' };
  }

  const formLink = `${appUrl}/quote/${parsed.ref.token}`;

  if (ctx.invitation.status === 'submitted') {
    await sendQuoteAckEmail(
      {
        to: parsed.sender,
        supplierName: ctx.supplier.companyName,
        rfqTitle: ctx.rfq.title,
        rfqId: ctx.rfq.id,
        token: parsed.ref.token,
        formLink,
        inReplySubject: parsed.subject,
        outcome: 'blocked',
        blockers: [
          {
            heading: 'Already submitted',
            items: [
              'A quotation has already been submitted for this RFQ and cannot be changed by email.',
            ],
          },
        ],
        lowConfidence: [],
        unreadableAttachments: [],
      },
      ctx.invitation.id
    );
    return { status: 'already-submitted' };
  }

  // ---- Run the Autofill agent ----------------------------------------
  const rfqDoc = ctx.rfq.rfqDocument
    ? normalizeRFQDocument(ctx.rfq.rfqDocument, {
        rfqId: ctx.rfq.id,
        buyer: '',
        fillDefaults: false,
      })
    : null;
  const rfqCurrency = rfqDoc?.header.currency || 'INR';

  const formSchema = (ctx.rfq.formSchema ?? { sections: [], fields: [] }) as FormSchema;
  const lines: RFQLineForResponse[] = ctx.lineItems.map((li) => ({
    id: li.id,
    itemDescription: li.itemDescription,
    quantity: li.quantity,
    unit: li.unit,
  }));
  const agentLineItems: AutofillLineItem[] = ctx.lineItems.map((li) => ({
    id: li.id,
    itemDescription: li.itemDescription,
    quantity: li.quantity,
    unit: li.unit,
  }));

  let patches: Parameters<typeof applyAgentPatches>[0] = {};
  let missingFields: string[] = [];
  let suggestions: string[] = [];

  if (parsed.documentTexts.length) {
    const agent = new AutofillAgent();
    const res = await agent.extractFormData(
      {
        documentTexts: parsed.documentTexts,
        formSchema,
        lineItems: agentLineItems,
        rfqCurrency,
      },
      ctx.invitation.id
    );
    if (res.success && res.data) {
      patches = res.data.patches;
      missingFields = res.data.missingFields;
      suggestions = res.data.suggestions;
    }
  }

  const applied = applyAgentPatches(patches, formSchema.fields ?? []);

  // ---- Merge into the draft -----------------------------------------
  const seeded = seedDraftState(lines, rfqCurrency, ctx.draft);

  // Lines the emailed document didn't cover are "not offered" — mark them so
  // (as a to-confirm blocker) rather than demanding a price the supplier never
  // gave. This keeps the quote unblocked on the price fields but stops an
  // auto-submit: the ack email will carry the link to confirm.
  if (parsed.documentTexts.length) {
    inferNoBidForUncoveredLines(lines, applied, {
      responses: seeded.lineResponses,
      provenance: seeded.provenance,
    });
  }

  const merged = mergePatchesIntoDraft(seeded, applied);

  // ---- Record the email as chat turns -----------------------------
  const agentSummary = summarise(
    applied,
    missingFields,
    suggestions,
    parsed.unreadableAttachments
  );
  await db.insert(chatMessages).values([
    {
      rfqInvitationId: ctx.invitation.id,
      role: 'user',
      content:
        `(received by email)\n\n${parsed.body || '(no message body)'}` +
        (payload.attachments?.length
          ? `\n\n[${payload.attachments.length} attachment(s)]`
          : ''),
      attachments: (payload.attachments ?? []).map((a) => a.filename || 'attachment'),
    },
    {
      rfqInvitationId: ctx.invitation.id,
      role: 'assistant',
      content: agentSummary,
      extractedData: {
        linePatches: applied.linePatches,
        formPatches: applied.formPatches,
        provenance: applied.provenance,
      },
    },
  ]);

  // ---- Decide: submit or draft -----------------------------------
  const assessment = assessQuoteAck({
    lines,
    responses: merged.lineResponses,
    formSchema,
    formData: merged.formData,
    provenance: merged.provenance,
  });

  if (assessment.decision === 'submit') {
    const wasRevision = ctx.invitation.status === 'negotiating' && !!ctx.submission;
    await autoSubmit(ctx, merged, lines, rfqCurrency);
    await deleteDraft(ctx.invitation.id);
    if (wasRevision) await notifyBuyerOfRevision(ctx, appUrl);
    await sendQuoteAckEmail(
      {
        to: parsed.sender,
        supplierName: ctx.supplier.companyName,
        rfqTitle: ctx.rfq.title,
        rfqId: ctx.rfq.id,
        token: parsed.ref.token,
        formLink,
        inReplySubject: parsed.subject,
        outcome: 'submitted',
        blockers: [],
        lowConfidence: [],
        unreadableAttachments: parsed.unreadableAttachments,
      },
      ctx.invitation.id
    );
    return { status: 'submitted' };
  }

  await saveDraft(ctx.invitation.id, merged, 'email');
  if (ctx.invitation.status === 'sent') {
    await db
      .update(rfqInvitations)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(eq(rfqInvitations.id, ctx.invitation.id));
  }

  await sendQuoteAckEmail(
    {
      to: parsed.sender,
      supplierName: ctx.supplier.companyName,
      rfqTitle: ctx.rfq.title,
      rfqId: ctx.rfq.id,
      token: parsed.ref.token,
      formLink,
      inReplySubject: parsed.subject,
      outcome: assessment.blockers.total > 0 ? 'blocked' : 'verify',
      blockers: groupBlockers(assessment.blockers),
      lowConfidence: assessment.lowConfidence.map((l) => ({
        label: l.label,
        value: l.value,
        rationale: l.rationale,
      })),
      unreadableAttachments: parsed.unreadableAttachments,
    },
    ctx.invitation.id
  );

  return {
    status: assessment.blockers.total > 0 ? 'draft-blocked' : 'draft-verify',
  };
}

// ---------------------------------------------------------------------------

function summarise(
  applied: ReturnType<typeof applyAgentPatches>,
  missingFields: string[],
  suggestions: string[],
  unreadable: string[]
): string {
  const nLine = Object.keys(applied.linePatches).length;
  const nForm = Object.keys(applied.formPatches).length;
  const parts = [
    `Read your email${unreadable.length ? ` (couldn't read: ${unreadable.join(', ')})` : ''}: ` +
      `updated ${nLine} line item(s)${nForm ? ` and ${nForm} quote-level field(s)` : ''}.`,
  ];
  if (missingFields.length) parts.push(`Still needs your input: ${missingFields.join('; ')}.`);
  if (suggestions.length) parts.push(suggestions.join(' '));
  return parts.join(' ');
}

async function autoSubmit(
  ctx: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>>,
  merged: ReturnType<typeof mergePatchesIntoDraft>,
  lines: RFQLineForResponse[],
  rfqCurrency: string
) {
  const lineItems = lines.map((li) => {
    const r = merged.lineResponses[li.id];
    const qty = committedQty(r, li.quantity);
    const unitPrice = r.canSupply === 'no' ? null : r.unitPrice;
    return {
      itemId: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity,
      canSupply: r.canSupply,
      unitPrice,
      currency: r.currency,
      quotedUom: r.quotedUom,
      availableQty: r.availableQty,
      committedQty: qty,
      leadTimeDays: r.leadTimeDays,
      moq: r.moq,
      totalPrice: unitPrice != null ? unitPrice * qty : null,
    };
  });

  const totalAmount = lineItems.reduce(
    (sum, li) =>
      sum +
      (li.totalPrice != null && (li.currency ?? rfqCurrency) === rfqCurrency
        ? li.totalPrice
        : 0),
    0
  );

  // A resubmit during a review / negotiation round updates the existing
  // submission in place and marks that round's comments addressed.
  const isRevision = ctx.invitation.status === 'negotiating' && !!ctx.submission;
  const now = new Date();

  if (isRevision && ctx.submission) {
    await db
      .update(quoteSubmissions)
      .set({
        formData: merged.formData,
        lineItems,
        totalAmount,
        currency: rfqCurrency,
        notes: merged.notes || null,
        revision: (ctx.submission.revision ?? 0) + 1,
        revisedAt: now,
      })
      .where(eq(quoteSubmissions.id, ctx.submission.id));
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
    await db.insert(quoteSubmissions).values({
      rfqInvitationId: ctx.invitation.id,
      formData: merged.formData,
      lineItems,
      totalAmount,
      currency: rfqCurrency,
      notes: merged.notes || null,
    });
  }

  await db
    .update(rfqInvitations)
    .set({ status: 'submitted', submittedAt: now })
    .where(eq(rfqInvitations.id, ctx.invitation.id));
}

async function notifyBuyerOfRevision(
  ctx: NonNullable<Awaited<ReturnType<typeof loadQuoteContext>>>,
  appUrl: string
) {
  try {
    const [rfqRow] = await db
      .select({ createdBy: rfqs.createdBy })
      .from(rfqs)
      .where(eq(rfqs.id, ctx.rfq.id));
    const [buyer] = rfqRow
      ? await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(eq(users.id, rfqRow.createdBy))
      : [];
    const [current] = await db
      .select({ revision: quoteSubmissions.revision })
      .from(quoteSubmissions)
      .where(eq(quoteSubmissions.rfqInvitationId, ctx.invitation.id));
    if (buyer?.email) {
      await sendQuoteRevisedEmail(
        {
          to: buyer.email,
          buyerName: buyer.name || 'there',
          supplierName: ctx.supplier.companyName,
          rfqTitle: ctx.rfq.title,
          rfqId: ctx.rfq.id,
          reviewLink: `${appUrl}/dashboard/rfqs/${ctx.rfq.id}/quotes/${ctx.invitation.id}`,
          round: current?.revision ?? 1,
        },
        ctx.invitation.id
      );
    }
  } catch (e) {
    console.error('revised-quote notification failed', e);
  }
}

async function replyUnmatched(to: string, subject: string, appUrl: string) {
  if (!to) return;
  await sendPlainReply(
    to,
    subject,
    `We received your email but could not match it to an RFQ invitation. The ` +
      `subject line must keep the reference tag we included (in square brackets). ` +
      `Please reply to the original invitation email without changing the subject, ` +
      `or use the unique link in that invitation. (${appUrl})`
  );
}

async function replyMismatch(to: string, subject: string, appUrl: string) {
  if (!to) return;
  await sendPlainReply(
    to,
    subject,
    `We received your email but the sending address does not match the supplier ` +
      `contact on this RFQ invitation. Please reply from the address the invitation ` +
      `was sent to, or use the unique link in that invitation. (${appUrl})`
  );
}
