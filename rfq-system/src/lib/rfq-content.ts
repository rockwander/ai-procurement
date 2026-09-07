import type { RFQDraftOutput } from '@/lib/agents/rfq-drafting';

/**
 * Render an RFQ draft (or stored generatedContent JSON) into a plain-text
 * summary used in email bodies and as the AI form-generation input.
 */
export function draftToSummary(draft: Partial<RFQDraftOutput>): string {
  const parts: string[] = [];
  if (draft.description) parts.push(draft.description);
  if (draft.requirements?.length) {
    parts.push('\nKey requirements:\n' + draft.requirements.map((r) => `- ${r}`).join('\n'));
  }
  if (draft.lineItems?.length) {
    parts.push(
      '\nLine items:\n' +
        draft.lineItems
          .map((li) => `- ${li.itemDescription} (${li.quantity} ${li.unit})`)
          .join('\n')
    );
  }
  if (draft.evaluationCriteria?.length) {
    parts.push('\nEvaluation criteria:\n' + draft.evaluationCriteria.map((c) => `- ${c}`).join('\n'));
  }
  return parts.join('\n');
}

export function shortSummary(draft: Partial<RFQDraftOutput>, maxLen = 400): string {
  const text = (draft.description || '').trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}
