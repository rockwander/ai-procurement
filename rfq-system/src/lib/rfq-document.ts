// The canonical structured RFQ document. Both the PDF renderer and the
// single-column form builder render this shape, and every "update" from the
// create-RFQ chat regenerates it. See MASTER_SPEC.md §2 step 1 + Appendix A.

export interface RFQHeader {
  buyer: string;
  rfqId: string;
  quoteDeadline: string;      // free text or ISO date
  expectedDelivery: string;
  currency: string;
  validity: string;
}

export interface RFQLineItemDoc {
  id: string;
  line: number;               // 1-based display index
  item: string;
  specification: string;
  quantity: number;
  unit: string;
}

// A commercial field the vendor answers ONCE for the whole quote (section 2) —
// e.g. tooling charges, rebate tiers, price validity. The per-line-item response
// (unit price, currency, UoM, can-supply, available qty, lead time, MOQ) is a
// FIXED schema and is NOT represented here — see src/lib/line-response.ts and
// MASTER_SPEC 2026-09-09.
export interface CommercialField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  required: boolean;
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  responseType: 'yesno' | 'text' | 'file';
  required: boolean;
}

export interface RFQDocument {
  header: RFQHeader;
  lineItems: RFQLineItemDoc[];
  commercialFields: CommercialField[];   // section 2 — quote-level, answered once
  questionnaire: QuestionnaireItem[];    // section 3
  supportingDocsNote: string;            // section 3 upload ask
  termsAndConditions: string[];          // section 4
}

let seq = 0;
function rid(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Quote-level commercial fields every RFQ asks for by default. These are
 * answered ONCE for the whole quote. Per-line commercials (unit price, currency,
 * UoM, MOQ, lead time, can-supply, available qty) are a fixed schema handled in
 * src/lib/line-response.ts and are NOT listed here.
 */
export function defaultCommercialFields(): CommercialField[] {
  return [
    { id: rid('cf'), label: 'Applicable taxes (GST %)', type: 'text', required: true },
    { id: rid('cf'), label: 'Freight / transport charges', type: 'text', required: true },
    { id: rid('cf'), label: 'Payment terms offered', type: 'text', required: false },
    { id: rid('cf'), label: 'Volume / rebate discount', type: 'text', required: false },
    { id: rid('cf'), label: 'One-time tooling / setup charges', type: 'text', required: false },
    { id: rid('cf'), label: 'Price validity', type: 'text', required: false },
  ];
}

/** Human-readable list of what the fixed per-line response captures — used by
 *  the PDF's "Commercial information requested" section and the form builder. */
export const PER_LINE_RESPONSE_ITEMS: string[] = [
  'Whether you can supply the item (in full, partially, or not at all)',
  'Unit price',
  'Currency (if different from the RFQ currency)',
  'Unit of measure your price is quoted in (e.g. per piece, per 100, per box)',
  'Quantity you can supply (if less than the quantity asked)',
  'Lead time in days',
  'Minimum order quantity',
];

export function defaultTerms(): string[] {
  return [
    'Delivery location',
    'Payment terms',
    'Quote validity',
    'Delivery commitment',
    'Warranty/replacement terms',
    'Taxes and freight treatment',
    'Penalties, if applicable',
  ];
}

/** A blank document for a freshly-created draft RFQ (no "update" run yet). */
export function emptyRFQDocument(rfqId: string, buyer: string): RFQDocument {
  return {
    header: {
      buyer,
      rfqId,
      quoteDeadline: '',
      expectedDelivery: '',
      currency: 'INR',
      validity: 'Quote valid for 90 days',
    },
    lineItems: [],
    commercialFields: defaultCommercialFields(),
    questionnaire: [],
    supportingDocsNote: 'Upload certificates / relevant documents.',
    termsAndConditions: defaultTerms(),
  };
}

export function newLineItem(line: number): RFQLineItemDoc {
  return { id: rid('li'), line, item: '', specification: '', quantity: 1, unit: 'pcs' };
}

export function newCommercialField(): CommercialField {
  return { id: rid('cf'), label: 'New quote-level field', type: 'text', required: false };
}

export function newQuestion(): QuestionnaireItem {
  return { id: rid('q'), question: 'New question', responseType: 'yesno', required: false };
}

/** Renumber line items 1..n after add/delete/reorder. */
export function renumber(items: RFQLineItemDoc[]): RFQLineItemDoc[] {
  return items.map((li, i) => ({ ...li, line: i + 1 }));
}

/**
 * Coerce whatever the drafting agent returned (or a legacy generatedContent
 * blob) into a valid RFQDocument.
 *
 * `fillDefaults` (default true): when the commercial fields or terms come back
 * empty, substitute the standard set — a raw AI response with none is more
 * likely incomplete than intentional. Pass `false` when the document was
 * deliberately filtered (e.g. `documentFromOutline`), so empty means empty.
 */
export function normalizeRFQDocument(
  raw: unknown,
  fallback: { rfqId: string; buyer: string; fillDefaults?: boolean }
): RFQDocument {
  const fillDefaults = fallback.fillDefaults !== false;
  const base = emptyRFQDocument(fallback.rfqId, fallback.buyer);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;

  const header = { ...base.header, ...(r.header ?? {}) };
  header.rfqId = header.rfqId || fallback.rfqId;
  header.buyer = header.buyer || fallback.buyer;

  const lineItems: RFQLineItemDoc[] = Array.isArray(r.lineItems)
    ? renumber(
        r.lineItems.map((li: any) => ({
          id: li.id || rid('li'),
          line: 0,
          item: String(li.item ?? li.itemDescription ?? ''),
          specification: String(li.specification ?? ''),
          quantity: Number(li.quantity ?? li.qty ?? 1) || 1,
          unit: String(li.unit ?? 'pcs'),
        }))
      )
    : [];

  const rawCF: CommercialField[] = Array.isArray(r.commercialFields)
    ? r.commercialFields
        .map((cf: any) => ({
          id: cf.id || rid('cf'),
          label: String(cf.label ?? cf.name ?? '').trim(),
          type: ['text', 'number', 'select'].includes(cf.type) ? cf.type : 'text',
          options: Array.isArray(cf.options) ? cf.options.map(String) : undefined,
          required: Boolean(cf.required),
        }))
        // Drop fields the agent returned without a name — an unlabelled field is
        // not something a supplier can answer.
        .filter((cf: CommercialField) => cf.label.length > 0)
    : [];
  const commercialFields: CommercialField[] =
    rawCF.length || !fillDefaults ? rawCF : base.commercialFields;

  const questionnaire: QuestionnaireItem[] = Array.isArray(r.questionnaire)
    ? r.questionnaire
        .map((q: any) => ({
          id: q.id || rid('q'),
          question: String(q.question ?? q.label ?? '').trim(),
          responseType: ['yesno', 'text', 'file'].includes(q.responseType)
            ? q.responseType
            : 'yesno',
          required: Boolean(q.required),
        }))
        .filter((q: QuestionnaireItem) => q.question.length > 0)
    : [];

  const termsAndConditions: string[] =
    (Array.isArray(r.termsAndConditions) && r.termsAndConditions.length) || !fillDefaults
      ? (Array.isArray(r.termsAndConditions) ? r.termsAndConditions.map(String) : [])
      : base.termsAndConditions;

  return {
    header,
    lineItems,
    commercialFields,
    questionnaire,
    supportingDocsNote: String(r.supportingDocsNote ?? base.supportingDocsNote),
    termsAndConditions,
  };
}

/** Plain-text rendering used for email summaries and as agent input. */
export function rfqDocumentToText(doc: RFQDocument): string {
  const parts: string[] = [];
  const h = doc.header;
  parts.push(`RFQ: ${h.buyer || ''} — ${h.rfqId}`);
  if (h.quoteDeadline) parts.push(`Quote deadline: ${h.quoteDeadline}`);
  if (h.expectedDelivery) parts.push(`Expected delivery: ${h.expectedDelivery}`);
  if (h.currency) parts.push(`Currency: ${h.currency}`);
  if (h.validity) parts.push(`Validity: ${h.validity}`);

  if (doc.lineItems.length) {
    parts.push('\nLine items:');
    doc.lineItems.forEach((li) =>
      parts.push(`  ${li.line}. ${li.item} — ${li.specification} — ${li.quantity} ${li.unit}`)
    );
  }
  parts.push('\nCommercial information requested:');
  parts.push('  For each line item: ' + PER_LINE_RESPONSE_ITEMS.join('; ') + '.');
  if (doc.commercialFields.length) {
    parts.push(
      '  Once for the whole quote: ' +
        doc.commercialFields.map((c) => c.label).join(', ') +
        '.'
    );
  }
  if (doc.questionnaire.length) {
    parts.push('\nQuality questionnaire:');
    doc.questionnaire.forEach((q) => parts.push(`  - ${q.question}`));
  }
  if (doc.termsAndConditions.length) {
    parts.push('\nTerms & conditions:');
    doc.termsAndConditions.forEach((t) => parts.push(`  - ${t}`));
  }
  return parts.join('\n');
}

/** Short description for RFQ list / email teaser. */
export function rfqDocumentTitle(doc: RFQDocument): string {
  const first = doc.lineItems[0]?.item;
  if (first) return `RFQ: ${first}${doc.lineItems.length > 1 ? ` +${doc.lineItems.length - 1} more` : ''}`;
  return 'Untitled RFQ';
}
