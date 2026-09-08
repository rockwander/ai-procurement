// The proposed-outline step of create-RFQ. The Drafting Agent produces a full
// RFQDocument; this module turns that document into a reviewable outline of
// ticked sub-headings (two groups), lets the buyer inspect each section's
// already-drafted content, and rebuilds a document from the ticked sections.
//
// No AI calls here — everything is derived from the document the agent already
// produced. See MASTER_SPEC.md §2 step 1 (outline → confirm → apply).

import {
  RFQDocument,
  RFQLineItemDoc,
  CommercialField,
  QuestionnaireItem,
  emptyRFQDocument,
  renumber,
} from '@/lib/rfq-document';

export type OutlineGroup = 'supplier' | 'buyer';

export const GROUP_LABEL: Record<OutlineGroup, string> = {
  supplier: 'Supplier must provide',
  buyer: 'Buyer provides',
};

export interface OutlineSection {
  id: string;            // stable within one outline
  group: OutlineGroup;
  heading: string;       // sub-heading shown in the chat
  summary: string;       // one-line "what this contains"
  detail: string[];      // the drafted content, line by line, shown on click
  ticked: boolean;       // included by default
  /** which part of the RFQDocument this section maps to */
  kind:
    | 'lineItems'
    | 'commercialFields'
    | 'questionnaire'
    | 'supportingDocs'
    | 'header'
    | 'term';
  /** for kind='term', the index of the T&C string */
  termIndex?: number;
}

export interface RFQOutline {
  document: RFQDocument; // the full drafted document (source of truth for detail)
  sections: OutlineSection[];
}

let seq = 0;
const sid = () => `s${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function lineItemDetail(items: RFQLineItemDoc[]): string[] {
  return items.map(
    (li) => `${li.line}. ${li.item} — ${li.specification || 'spec TBD'} — ${li.quantity} ${li.unit}`
  );
}

function commercialDetail(fields: CommercialField[]): string[] {
  return fields.map(
    (f) => `${f.label} (${f.type}${f.required ? ', required' : ''})`
  );
}

function questionnaireDetail(qs: QuestionnaireItem[]): string[] {
  return qs.map(
    (q) => `${q.question}  [${q.responseType}${q.required ? ', required' : ''}]`
  );
}

/**
 * Build the outline from a freshly-drafted RFQ document.
 * `prev` carries a section's ticked state across a re-outline; `excluded`
 * (headings the buyer unticked on a previous apply) forces those unticked.
 */
export function buildOutline(
  doc: RFQDocument,
  prev?: RFQOutline | null,
  excluded?: string[]
): RFQOutline {
  const excludedSet = new Set((excluded ?? []).map((h) => h.toLowerCase()));
  const wasTicked = (
    kind: OutlineSection['kind'],
    heading: string,
    hasContent: boolean,
    termIndex?: number
  ): boolean => {
    if (excludedSet.has(heading.toLowerCase())) {
      // The buyer excluded this before. If the agent drafted content for it
      // this round, the buyer asked for it back — tick it. Otherwise keep it
      // excluded.
      return hasContent;
    }
    if (!prev) return true;
    const match = prev.sections.find(
      (s) => s.kind === kind && s.termIndex === termIndex
    );
    return match ? match.ticked : true;
  };

  const sections: OutlineSection[] = [];

  // --- Supplier must provide ---
  sections.push({
    id: sid(),
    group: 'supplier',
    heading: 'Line items',
    summary: `${doc.lineItems.length} item(s) to be quoted`,
    detail: lineItemDetail(doc.lineItems),
    ticked: wasTicked('lineItems', 'Line items', doc.lineItems.length > 0),
    kind: 'lineItems',
  });
  sections.push({
    id: sid(),
    group: 'supplier',
    heading: 'Commercial information requested',
    summary: `${doc.commercialFields.length} field(s) per line item`,
    detail: commercialDetail(doc.commercialFields),
    ticked: wasTicked('commercialFields', 'Commercial information requested', doc.commercialFields.length > 0),
    kind: 'commercialFields',
  });
  sections.push({
    id: sid(),
    group: 'supplier',
    heading: 'Quality questionnaire',
    summary: `${doc.questionnaire.length} question(s)`,
    detail: questionnaireDetail(doc.questionnaire),
    ticked: wasTicked('questionnaire', 'Quality questionnaire', doc.questionnaire.length > 0),
    kind: 'questionnaire',
  });
  sections.push({
    id: sid(),
    group: 'supplier',
    heading: 'Supporting documents',
    summary: 'Certificates / documents the supplier should attach',
    detail: [doc.supportingDocsNote || 'Upload certificates / relevant documents.'],
    ticked: wasTicked('supportingDocs', 'Supporting documents', !!doc.supportingDocsNote),
    kind: 'supportingDocs',
  });

  // --- Buyer provides ---
  const h = doc.header;
  sections.push({
    id: sid(),
    group: 'buyer',
    heading: 'Scope & header',
    summary: 'Buyer, deadline, delivery, currency, validity',
    detail: [
      `Buyer: ${h.buyer || '—'}`,
      `Quote deadline: ${h.quoteDeadline || '—'}`,
      `Expected delivery: ${h.expectedDelivery || '—'}`,
      `Currency: ${h.currency || '—'}`,
      `Validity: ${h.validity || '—'}`,
    ],
    ticked: wasTicked('header', 'Scope & header', true),
    kind: 'header',
  });
  doc.termsAndConditions.forEach((t, i) => {
    const heading = termHeading(t);
    sections.push({
      id: sid(),
      group: 'buyer',
      heading,
      summary: 'Term / condition',
      detail: [t],
      ticked: wasTicked('term', heading, true, i),
      kind: 'term',
      termIndex: i,
    });
  });

  return { document: doc, sections };
}

function termHeading(term: string): string {
  // Use the leading phrase before a colon / dash, else the first ~6 words.
  const head = term.split(/[:—-]/)[0].trim();
  if (head && head.length <= 48) return head;
  return term.split(/\s+/).slice(0, 6).join(' ') + (term.split(/\s+/).length > 6 ? '…' : '');
}

/**
 * Rebuild an RFQ document from the outline, keeping only the ticked sections.
 * The header is always kept (an RFQ needs one) but its scope fields are blanked
 * if the "Scope & header" section was unticked.
 */
export function documentFromOutline(outline: RFQOutline): RFQDocument {
  const doc = outline.document;
  const on = (kind: OutlineSection['kind'], termIndex?: number) =>
    outline.sections.some(
      (s) => s.kind === kind && s.termIndex === termIndex && s.ticked
    );

  const base = emptyRFQDocument(doc.header.rfqId, doc.header.buyer);

  const header = on('header')
    ? doc.header
    : { ...base.header, rfqId: doc.header.rfqId, buyer: doc.header.buyer };

  const terms = doc.termsAndConditions.filter((_, i) => on('term', i));

  return {
    header,
    lineItems: on('lineItems') ? renumber(doc.lineItems) : [],
    commercialFields: on('commercialFields') ? doc.commercialFields : [],
    questionnaire: on('questionnaire') ? doc.questionnaire : [],
    supportingDocsNote: on('supportingDocs')
      ? doc.supportingDocsNote
      : '',
    termsAndConditions: terms,
  };
}

/** Human summary of an outline for the assistant's chat message. */
export function outlineToText(outline: RFQOutline): string {
  const byGroup = (g: OutlineGroup) =>
    outline.sections
      .filter((s) => s.group === g)
      .map((s) => `  - ${s.heading} — ${s.summary}`)
      .join('\n');

  return (
    `Here's what I'll put in the RFQ. Every heading is ticked by default — ` +
    `untick anything you don't want, click a heading to see its contents, ` +
    `then hit "Confirm & apply to RFQ".\n\n` +
    `${GROUP_LABEL.supplier}:\n${byGroup('supplier')}\n\n` +
    `${GROUP_LABEL.buyer}:\n${byGroup('buyer')}`
  );
}
