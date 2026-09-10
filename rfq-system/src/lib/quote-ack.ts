// Given a merged draft quotation (fixed per-line grid + buyer-defined fields +
// provenance), decide what to tell the supplier who responded by email:
//
//  - blockers:      mandatory fields still missing  → the "needs attention" list
//  - lowConfidence: filled fields that render amber (AI medium/low, or a
//                   system-inferred default not yet corroborated) — to verify
//  - decision:      'submit' only when there are NO blockers AND NO amber fields;
//                   otherwise 'draft'
//
// See REQUIREMENT_quote-via-email.md §4–§5.

import type { LineItemResponse, RFQLineForResponse } from '@/lib/line-response';
import type { FormSchema } from '@/lib/form-schema';
import { QUESTIONNAIRE_SECTION } from '@/lib/form-schema';
import {
  missingMandatory,
  fieldState,
  lineFieldApplicable,
  parseLineFieldId,
  LINE_FIELD_META,
  LINE_FIELDS,
  type ProvenanceMap,
  type AttentionList,
  type AttentionItem,
} from '@/lib/line-response-status';

export interface LowConfidenceItem {
  /** target id: `line:<itemId>:<field>` or a form field id */
  id: string;
  /** e.g. "Line 3 — Currency" or the form field label */
  label: string;
  /** the current (assumed / low-confidence) value, formatted for display */
  value: string;
  /** why it's amber — the pinned rationale, or a generic fallback */
  rationale: string;
  /** 'assumed' = system default not corroborated; 'uncertain' = AI med/low */
  kind: 'assumed' | 'uncertain';
}

export interface QuoteAckAssessment {
  blockers: AttentionList;
  /** all amber fields — shown in the "please verify" section of the email */
  lowConfidence: LowConfidenceItem[];
  decision: 'submit' | 'draft';
}

// Which amber fields block an email auto-submit. A bare system default
// (`assumed`: currency = the RFQ currency, UoM = the asked unit) is the safe
// value and the buyer sees it in the comparison anyway, so it does NOT block —
// it's still listed in the ack email for the supplier's awareness. Only a
// genuine AI extraction at medium/low confidence (`uncertain`) blocks, because
// that could be wrong and one-shot submission would freeze it in.
// Product-owner decision, 2026-09-10.
function blocksAutoSubmit(kind: LowConfidenceItem['kind']): boolean {
  return kind === 'uncertain';
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(blank)';
  return String(v);
}

/**
 * Walk every written value in the merged draft and collect the amber ones.
 * Mirrors the preview's colour logic (line-response-status.fieldState) so the
 * email and the page agree on what "needs verifying" means.
 */
function collectLowConfidence(
  lines: RFQLineForResponse[],
  responses: Record<string, LineItemResponse | undefined>,
  formSchema: FormSchema | null,
  formData: Record<string, unknown>,
  provenance: ProvenanceMap
): LowConfidenceItem[] {
  const out: LowConfidenceItem[] = [];
  const lineIndex = new Map(lines.map((l, i) => [l.id, i]));

  lines.forEach((line, i) => {
    const r = responses[line.id];
    if (!r) return;
    for (const field of LINE_FIELDS) {
      const meta = LINE_FIELD_META[field];
      if (field === 'canSupply') continue; // always has a value, never amber-worth-flagging
      const value = r[field] as unknown;
      const prov = provenance[`line:${line.id}:${field}`];
      const state = fieldState(value, meta, prov, {
        applicable: lineFieldApplicable(field, r),
      });
      if (state === 'assumed' || state === 'uncertain') {
        out.push({
          id: `line:${line.id}:${field}`,
          label: `Line ${i + 1} — ${meta.label}`,
          value: fmtValue(value),
          rationale: prov?.rationale || genericRationale(state),
          kind: state,
        });
      }
    }
  });

  for (const f of formSchema?.fields ?? []) {
    const value = formData[f.id];
    const prov = provenance[f.id];
    // Non-mandatory blank fields are grey, not amber; blank mandatory ones are
    // blockers, handled elsewhere. Only classify fields that have a value.
    if (value === null || value === undefined || value === '') continue;
    const state = fieldState(value, { blocking: f.required }, prov, { applicable: true });
    if (state === 'assumed' || state === 'uncertain') {
      out.push({
        id: f.id,
        label: f.label,
        value: fmtValue(value),
        rationale: prov?.rationale || genericRationale(state),
        kind: state,
      });
    }
  }

  // lineIndex kept for potential ordering; currently we emit in line order then
  // form order, which is already what the buyer / supplier expect.
  void lineIndex;
  return out;
}

function genericRationale(state: 'assumed' | 'uncertain'): string {
  return state === 'assumed'
    ? 'assumed default — not stated in your email'
    : 'read from your email but needs a second look';
}

export function assessQuoteAck(input: {
  lines: RFQLineForResponse[];
  responses: Record<string, LineItemResponse | undefined>;
  formSchema: FormSchema | null;
  formData: Record<string, unknown>;
  provenance: ProvenanceMap;
}): QuoteAckAssessment {
  const blockers = missingMandatory(
    input.lines,
    input.responses,
    input.formSchema,
    input.formData
  );
  const lowConfidence = collectLowConfidence(
    input.lines,
    input.responses,
    input.formSchema,
    input.formData,
    input.provenance
  );

  const blockingAmber = lowConfidence.filter((l) => blocksAutoSubmit(l.kind));
  const decision: 'submit' | 'draft' =
    blockers.total === 0 && blockingAmber.length === 0 ? 'submit' : 'draft';

  return { blockers, lowConfidence, decision };
}

/** Group blocker items the way the "needs attention" panel does, for the email. */
export function groupBlockers(list: AttentionList): Array<{ heading: string; items: string[] }> {
  const headings: Record<AttentionItem['group'], string> = {
    'line-items': 'Line items',
    commercial: 'Commercial information',
    questionnaire: 'Quality questionnaire',
  };
  const groups: Array<{ heading: string; items: string[] }> = [];
  for (const g of ['line-items', 'commercial', 'questionnaire'] as const) {
    const items = list.items.filter((it) => it.group === g).map((it) => it.label);
    if (items.length) groups.push({ heading: headings[g], items });
  }
  return groups;
}

// re-export so callers get everything from one module
export { parseLineFieldId, QUESTIONNAIRE_SECTION };
