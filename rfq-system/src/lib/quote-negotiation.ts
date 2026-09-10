// Shared helpers for the review / negotiation round: turn a submitted quote
// back into an editable draft, and group the buyer's comments for the email
// and the supplier's view. See REQUIREMENT_quote-negotiation.md.

import {
  normaliseLineResponse,
  type LineItemResponse,
  type RFQLineForResponse,
} from '@/lib/line-response';
import type { DraftState } from '@/lib/quote-draft';
import { parseLineFieldId } from '@/lib/line-response-status';
import type { QuoteCommentItem } from '@/lib/email';

/**
 * Seed an editable draft from a submitted quote so the supplier's link reopens
 * pre-filled. Provenance is empty — everything the supplier submitted is
 * treated as their own confident value; only their edits this round change it.
 */
export function draftFromSubmission(
  lines: RFQLineForResponse[],
  submission: {
    lineItems: unknown;
    formData: unknown;
    notes: string | null;
  },
  rfqCurrency: string
): DraftState {
  const submittedById = new Map(
    (Array.isArray(submission.lineItems) ? submission.lineItems : []).map(
      (li: any) => [String(li.itemId), li]
    )
  );

  const lineResponses: Record<string, LineItemResponse> = {};
  for (const line of lines) {
    lineResponses[line.id] = normaliseLineResponse(
      submittedById.get(line.id),
      line,
      rfqCurrency
    );
  }

  return {
    lineResponses,
    formData: (submission.formData ?? {}) as Record<string, unknown>,
    notes: submission.notes ?? '',
    provenance: {},
  };
}

/**
 * Order comments line-first (line items in RFQ order, then commercial /
 * questionnaire, then whole-quote) and shape them for the email. Sectioning
 * into review vs negotiation is done by the caller from the AI's per-comment
 * classification, not here.
 */
export function orderComments<
  C extends { fieldId: string; fieldLabel: string; quotedValue: string | null; comment: string }
>(comments: C[], lineOrder: string[]): (C & QuoteCommentItem)[] {
  const rank = (fieldId: string): number => {
    const parsed = parseLineFieldId(fieldId);
    const lineId = parsed
      ? parsed.itemId
      : fieldId.startsWith('line:')
      ? fieldId.slice('line:'.length)
      : null;
    if (lineId) {
      const i = lineOrder.indexOf(lineId);
      return i === -1 ? 500 : i;
    }
    if (fieldId === '__quote') return 2000;
    return 1000; // commercial / questionnaire
  };

  return [...comments]
    .sort((a, b) => rank(a.fieldId) - rank(b.fieldId))
    .map((c) => ({
      ...c,
      label: c.fieldLabel,
      quotedValue: c.quotedValue,
      comment: c.comment,
    }));
}
