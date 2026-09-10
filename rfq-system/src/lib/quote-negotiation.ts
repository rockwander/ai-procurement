// Shared helpers for the review / negotiation round: turn a submitted quote
// back into an editable draft, and group the buyer's comments for the email
// and the supplier's view. See REQUIREMENT_quote-negotiation.md.

import type { QuoteComment } from '@/db/schema';
import {
  normaliseLineResponse,
  type LineItemResponse,
  type RFQLineForResponse,
} from '@/lib/line-response';
import type { DraftState } from '@/lib/quote-draft';
import { parseLineFieldId } from '@/lib/line-response-status';
import type { QuoteCommentGroup } from '@/lib/email';

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
 * Group comments by line item / section for the email and the supplier's
 * summary. `lineLabels` maps a line-item id to a display label
 * ("Line 3 — Corrugated box").
 */
export function groupComments(
  comments: Pick<QuoteComment, 'fieldId' | 'fieldLabel' | 'quotedValue' | 'comment'>[],
  lineLabels: Record<string, string>
): QuoteCommentGroup[] {
  const order: string[] = [];
  const byHeading = new Map<string, QuoteCommentGroup>();

  for (const c of comments) {
    const parsed = parseLineFieldId(c.fieldId);
    const lineId = parsed
      ? parsed.itemId
      : c.fieldId.startsWith('line:')
      ? c.fieldId.slice('line:'.length)
      : null;

    const heading = lineId
      ? lineLabels[lineId] ?? 'Line item'
      : c.fieldId === '__quote'
      ? 'Overall'
      : 'Commercial terms & questionnaire';

    if (!byHeading.has(heading)) {
      byHeading.set(heading, { heading, items: [] });
      order.push(heading);
    }
    byHeading.get(heading)!.items.push({
      label: c.fieldLabel,
      quotedValue: c.quotedValue,
      comment: c.comment,
    });
  }

  return order.map((h) => byHeading.get(h)!);
}
