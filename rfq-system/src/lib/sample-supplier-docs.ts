// Sample supplier submissions against the Corrugated Packaging RFQ. Three
// suppliers, two documents each, in mixed formats and with deliberately
// varying completeness so the Autofill agent + manual key-in flow can be
// exercised:
//
//   Supplier 1  Vaibhav Packaging      Quote PDF  + FAQ answers CSV   100%
//   Supplier 2  Shakti Corrugators     Quote CSV  + FAQ answers PDF    80%
//   Supplier 3  Metro Board & Cartons  Quote PDF  + FAQ answers CSV    70%
//
// Line items mirror the 15 groups in the item request (PR-2026-0417).

export type SupplierDocFormat = 'pdf' | 'csv';
export type SupplierDocKind = 'quote' | 'faq';

export interface SupplierDocMeta {
  slug: string;
  supplierSlug: string;
  supplierName: string;
  kind: SupplierDocKind;
  format: SupplierDocFormat;
  fileName: string;
  title: string;
  completeness: number; // 0-100, informational
}

export interface SupplierQuoteLine {
  line: number;
  item: string;
  askQty: number;
  unit: string;
  unitPrice: number | null; // null = not quoted
  moq: number | null;
  leadTimeDays: number | null;
}

export interface SupplierFaqAnswer {
  question: string;
  answer: string; // '' = not answered
}

export interface SupplierSubmission {
  supplierSlug: string;
  supplierName: string;
  contact: { person: string; email: string; phone: string; gstin: string };
  address: string;
  quoteRef: string;
  quoteDate: string;
  currency: string;
  validityDays: number | null;
  paymentTerms: string;
  incoterms: string;
  // commercial fields the RFQ asks for, at header level
  commercial: {
    gstPercent: string;
    freight: string;
    toolingCharges: string; // '' if omitted
    volumeDiscount: string; // '' if omitted
    priceValidity: string; // '' if omitted
  };
  lines: SupplierQuoteLine[];
  faq: SupplierFaqAnswer[];
  notes: string;
  completeness: number;
}

// The 15 RFQ line-item groups (from PR-2026-0417) with ask quantities.
const RFQ_LINES: Array<[string, number, string]> = [
  ['Corrugated mailer boxes, small (~230 x 150 x 100 mm)', 22000, 'pcs'],
  ['Corrugated mailer boxes, medium (~305 x 230 x 100 mm)', 10000, 'pcs'],
  ['Corrugated RSC shipper cartons, single wall, printed', 26000, 'pcs'],
  ['Corrugated RSC cartons, double wall', 32000, 'pcs'],
  ['Heavy-duty / triple wall cartons', 6800, 'pcs'],
  ['Die-cut trays and telescopic boxes', 30000, 'pcs'],
  ['Fitments - partitions / inserts / corner protectors / layer pads', 60000, 'set'],
  ['Speciality cartons - wardrobe, long-goods, pallet boxes', 4800, 'pcs'],
  ['Bottle-pack cartons with dividers (6 & 12)', 20000, 'pcs'],
  ['E-commerce returns cartons with double peel-seal', 25000, 'pcs'],
  ['Archive / storage cartons with integrated lid', 6000, 'pcs'],
  ['Fruit / produce ventilated crates, water-resistant', 10000, 'pcs'],
  ['Fragile-print cartons (all-face FRAGILE)', 7000, 'pcs'],
  ['Void-fill / cushioning fan-fold', 40000, 'pcs'],
  ['Shelf-ready display shippers, 4-colour', 4000, 'pcs'],
];

const RFQ_QUESTIONS = [
  'Do you hold a current ISO 9001 certification? (attach certificate)',
  'Do you hold FSC or PEFC chain-of-custody certification?',
  'What is the recycled fibre content (%) of the board you will supply?',
  'Can you meet the specified edge crush test (ECT) / bursting strength per item?',
  'Do you operate a documented incoming and in-process quality inspection procedure?',
  'Can you provide pre-production samples and a first-article inspection report?',
  'Have you supplied corrugated packaging at comparable annual volume in the last 3 years? (2 references)',
  'What is your maximum monthly production capacity for double-wall board?',
  'Can you hold two weeks of buffer stock for the top 5 items by volume?',
  'Do you provide EPR / plastic and packaging waste compliance documentation for India?',
];

function line(
  i: number,
  price: number | null,
  moq: number | null,
  lead: number | null
): SupplierQuoteLine {
  const [item, askQty, unit] = RFQ_LINES[i];
  return { line: i + 1, item, askQty, unit, unitPrice: price, moq, leadTimeDays: lead };
}

// ---------------------------------------------------------------------------
// Supplier 1 — Vaibhav Packaging — 100% complete
// ---------------------------------------------------------------------------

const S1: SupplierSubmission = {
  supplierSlug: 'vaibhav-packaging',
  supplierName: 'Vaibhav Packaging Industries Pvt. Ltd.',
  contact: {
    person: 'D. Vaibhav, Key Accounts',
    email: 'sales@vaibhavpackaging.example',
    phone: '+91 20 2712 4455',
    gstin: '27AABCV1234K1Z5',
  },
  address: 'G-14, Bhosari MIDC, Pune 411026, Maharashtra, India',
  quoteRef: 'VPI/Q/2026/0912',
  quoteDate: '12 Sep 2026',
  currency: 'INR',
  validityDays: 90,
  paymentTerms: 'Net 45 days from delivery',
  incoterms: 'DDP - ABC Manufacturing warehouse, Chakan',
  commercial: {
    gstPercent: '18%',
    freight: 'Included (DDP)',
    toolingCharges: 'INR 45,000 one-time for printed dies (items 3, 15); waived on 12-month agreement',
    volumeDiscount: '2% above INR 1.5 Cr annual, 3.5% above INR 2.0 Cr',
    priceValidity: '90 days from quote date; firm for first 6 months of the agreement',
  },
  lines: [
    line(0, 9.7, 5000, 10),
    line(1, 12.4, 4000, 10),
    line(2, 16.2, 3000, 12),
    line(3, 31.5, 2500, 14),
    line(4, 72.0, 800, 18),
    line(5, 20.1, 4000, 12),
    line(6, 8.3, 5000, 10),
    line(7, 196.0, 250, 21),
    line(8, 24.5, 2000, 12),
    line(9, 13.8, 5000, 10),
    line(10, 29.4, 2000, 14),
    line(11, 26.0, 3000, 12),
    line(12, 32.1, 2000, 14),
    line(13, 5.4, 10000, 7),
    line(14, 44.5, 1000, 16),
  ],
  faq: RFQ_QUESTIONS.map((q, i) => ({
    question: q,
    answer: [
      'Yes - ISO 9001:2015, certificate no. IN-QMS-88214, valid to Nov 2027. Certificate attached.',
      'Yes - FSC Chain of Custody, licence FSC-C123456.',
      '78% average recycled fibre; 82% on kraft grades.',
      'Yes - we test ECT/BCT per batch and certify against the spec for each item.',
      'Yes - documented incoming inspection (IQC) and in-process checks per ISO 9001; records retained 3 years.',
      'Yes - pre-production samples in 7 working days and a first-article inspection report with each new item.',
      'Yes - references: Blue Dart Express (approx. INR 3.1 Cr/yr, 2023-25) and Marico Ltd (approx. INR 1.8 Cr/yr, 2022-25). Contacts on request.',
      'Approx. 950 tonnes/month of double-wall board across two plants.',
      'Yes - two weeks rolling buffer for the five highest-volume items, reviewed monthly.',
      'Yes - EPR registration and quarterly plastic/packaging waste compliance filings; documents provided on award.',
    ][i],
  })),
  notes:
    'Prices ex-taxes, in INR, DDP Chakan. Firm for 6 months, then index-linked to the RISI India kraftliner index, capped at +/- 5% per quarter. Sample kit dispatched separately.',
  completeness: 100,
};

// ---------------------------------------------------------------------------
// Supplier 2 — Shakti Corrugators — ~80% complete
// (12 of 15 lines priced; tooling & price-validity omitted; 8 of 10 questions)
// ---------------------------------------------------------------------------

const S2: SupplierSubmission = {
  supplierSlug: 'shakti-corrugators',
  supplierName: 'Shakti Corrugators & Packaging',
  contact: {
    person: 'R. Shah',
    email: 'rfq@shakticorrugators.example',
    phone: '+91 253 661 2210',
    gstin: '27AAGFS7788M1Z9',
  },
  address: 'Plot 22, Ambad Industrial Area, Nashik 422010, Maharashtra, India',
  quoteRef: 'SCP-2026-338',
  quoteDate: '13 Sep 2026',
  currency: 'INR',
  validityDays: 60,
  paymentTerms: 'Net 30 days',
  incoterms: 'DDP Chakan',
  commercial: {
    gstPercent: '18%',
    freight: 'Included',
    toolingCharges: '', // omitted
    volumeDiscount: '2.5% above INR 1.8 Cr annual',
    priceValidity: '', // omitted
  },
  lines: [
    line(0, 9.9, 10000, 12),
    line(1, 12.9, 8000, 12),
    line(2, 17.0, 5000, 14),
    line(3, 33.0, 4000, 15),
    line(4, null, null, null), // not quoted - heavy duty
    line(5, 21.5, 6000, 14),
    line(6, 8.9, 8000, 12),
    line(7, null, null, null), // not quoted - speciality
    line(8, 25.9, 4000, 14),
    line(9, 14.5, 6000, 12),
    line(10, 30.5, 3000, 15),
    line(11, 27.5, 4000, 14),
    line(12, null, null, null), // not quoted - fragile print
    line(13, 5.9, 15000, 8),
    line(14, 49.0, 2000, 18),
  ],
  faq: RFQ_QUESTIONS.map((q, i) => ({
    question: q,
    answer: [
      'Yes - ISO 9001:2015 (cert IN-9001-55620).',
      'FSC application in progress; expected Q1 2027. PEFC not held.',
      'Approx. 70%.',
      'Yes for single and double wall. Triple wall / heavy-duty not offered.',
      'Yes - incoming and in-process inspection as per our QA manual.',
      '', // not answered - samples
      'Yes - references available (Nashik region FMCG clients).',
      '', // not answered - capacity
      'Can hold one week buffer; two weeks needs 60 days notice.',
      'Yes - EPR registered.',
    ][i],
  })),
  notes:
    'Items 5, 8 and 13 (heavy-duty, speciality and fragile-print cartons) are outside our current capability and are not quoted. Prices ex-GST, DDP Chakan. Please confirm annual commitment for the discount to apply.',
  completeness: 80,
};

// ---------------------------------------------------------------------------
// Supplier 3 — Metro Board & Cartons — ~70% complete
// (10 of 15 lines priced; MOQ/freight/volume discount omitted; 6 of 10 qs;
//  some answers are "TBD")
// ---------------------------------------------------------------------------

const S3: SupplierSubmission = {
  supplierSlug: 'metro-board-cartons',
  supplierName: 'Metro Board & Cartons',
  contact: {
    person: 'Sales Desk',
    email: 'metroboard.sales@example.com',
    phone: '+91 22 4009 7788',
    gstin: '', // omitted
  },
  address: 'Unit 7, Rabale MIDC, Navi Mumbai 400701, India',
  quoteRef: 'MBC/2026/Sep/41',
  quoteDate: '15 Sep 2026',
  currency: 'INR',
  validityDays: null, // omitted
  paymentTerms: 'To be discussed',
  incoterms: 'Ex-works Navi Mumbai (delivery can be arranged)',
  commercial: {
    gstPercent: '18%',
    freight: '', // omitted
    toolingCharges: 'Approx. INR 30,000 for printing plates - to be confirmed',
    volumeDiscount: '', // omitted
    priceValidity: '30 days',
  },
  lines: [
    line(0, 10.5, null, 15),
    line(1, 13.5, null, 15),
    line(2, 18.5, null, null),
    line(3, 35.0, null, 20),
    line(4, null, null, null),
    line(5, 23.0, null, null),
    line(6, 9.5, null, 15),
    line(7, null, null, null),
    line(8, null, null, null),
    line(9, 15.5, null, 14),
    line(10, null, null, null),
    line(11, 28.5, null, null),
    line(12, null, null, null),
    line(13, 6.5, null, 10),
    line(14, 52.0, null, 22),
  ],
  faq: RFQ_QUESTIONS.map((q, i) => ({
    question: q,
    answer: [
      'Yes - ISO 9001 (copy can be sent).',
      'No.',
      'TBD - depends on board grade selected.',
      'Yes for standard grades.',
      'Yes.',
      '', // not answered
      '', // not answered
      '', // not answered
      'TBD.',
      '', // not answered
    ][i],
  })),
  notes:
    'Budgetary quote. Items 5, 8, 9, 11 and 13 not quoted - please advise if required and we will revert. Freight and MOQ to be finalised after volume confirmation. Prices ex-works, ex-GST.',
  completeness: 70,
};

export const SUPPLIER_SUBMISSIONS: SupplierSubmission[] = [S1, S2, S3];

export function getSupplierSubmission(slug: string): SupplierSubmission | undefined {
  return SUPPLIER_SUBMISSIONS.find((s) => s.supplierSlug === slug);
}

// ---------------------------------------------------------------------------
// Doc index (2 docs per supplier, format per the spec)
// ---------------------------------------------------------------------------

const DOC_SPEC: Array<{ supplierSlug: string; kind: SupplierDocKind; format: SupplierDocFormat }> = [
  { supplierSlug: 'vaibhav-packaging', kind: 'quote', format: 'pdf' },
  { supplierSlug: 'vaibhav-packaging', kind: 'faq', format: 'csv' },
  { supplierSlug: 'shakti-corrugators', kind: 'quote', format: 'csv' },
  { supplierSlug: 'shakti-corrugators', kind: 'faq', format: 'pdf' },
  { supplierSlug: 'metro-board-cartons', kind: 'quote', format: 'pdf' },
  { supplierSlug: 'metro-board-cartons', kind: 'faq', format: 'csv' },
];

function shortName(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/g, '');
}

export function listSupplierDocs(): SupplierDocMeta[] {
  return DOC_SPEC.map(({ supplierSlug, kind, format }) => {
    const sub = getSupplierSubmission(supplierSlug)!;
    const idx = SUPPLIER_SUBMISSIONS.indexOf(sub) + 1;
    const kindLabel = kind === 'quote' ? 'Quote' : 'FAQ_Answers';
    return {
      slug: `${supplierSlug}-${kind}`,
      supplierSlug,
      supplierName: sub.supplierName,
      kind,
      format,
      fileName: `Supplier${idx}_${shortName(sub.supplierName)}_${kindLabel}.${format}`,
      title: `Supplier ${idx} — ${sub.supplierName} — ${kind === 'quote' ? 'Quotation' : 'Questionnaire answers'}`,
      completeness: sub.completeness,
    };
  });
}

export function getSupplierDoc(slug: string): SupplierDocMeta | undefined {
  return listSupplierDocs().find((d) => d.slug === slug);
}

// Data helpers shared by the PDF and CSV generators ------------------------

export function quoteTotals(sub: SupplierSubmission) {
  const priced = sub.lines.filter((l) => l.unitPrice != null);
  const lineTotal = priced.reduce((sum, l) => sum + (l.unitPrice as number) * l.askQty, 0);
  return {
    pricedLines: priced.length,
    totalLines: sub.lines.length,
    estimatedValue: lineTotal,
  };
}

export function answeredCount(sub: SupplierSubmission): number {
  return sub.faq.filter((a) => a.answer.trim().length > 0).length;
}
