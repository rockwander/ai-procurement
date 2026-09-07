// Sample documents for the "Sample docs" page. Three linked documents that
// tell one story: a business-approved item request and a procurement policy
// that together drive the formation of an RFQ. Reverse-engineered from the
// Corrugated Packaging RFQ so the chain reads as: requisition + policy -> RFQ.
//
// Plain data only; PDF layouts live in src/lib/pdf/sample-*.tsx.

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type SampleDocKind = 'requisition' | 'policy' | 'rfq';

export interface SampleDocMeta {
  slug: string;
  kind: SampleDocKind;
  fileName: string;
  title: string;
  summary: string;
  /** slugs of the documents this one feeds into / derives from */
  relatedSlugs: string[];
}

// ---------------------------------------------------------------------------
// 1. Business-approved item request (purchase requisition)
// ---------------------------------------------------------------------------

export interface RequisitionLine {
  line: number;
  item: string;
  purpose: string;
  annualQty: number;
  unit: string;
  estUnitCost: number; // INR
}

export interface SampleRequisition {
  meta: SampleDocMeta;
  reqNo: string;
  raisedBy: { name: string; title: string; department: string; date: string };
  costCentre: string;
  neededBy: string;
  businessJustification: string;
  budgetLine: string;
  estimatedAnnualValue: number; // INR, computed but stated
  currency: string;
  approvals: Array<{
    level: string;
    name: string;
    title: string;
    date: string;
    note: string;
  }>;
  lines: RequisitionLine[];
  notesToProcurement: string[];
}

// ---------------------------------------------------------------------------
// 2. Procurement policy
// ---------------------------------------------------------------------------

export interface PolicyClause {
  ref: string;
  heading: string;
  body: string;
}

export interface SamplePolicy {
  meta: SampleDocMeta;
  policyNo: string;
  version: string;
  effectiveDate: string;
  owner: string;
  appliesTo: string;
  purpose: string;
  approvalMatrix: Array<{ band: string; approver: string; competition: string }>;
  clauses: PolicyClause[];
  categoryRules: Array<{
    category: string;
    mandatoryCommercialFields: string[];
    mandatoryQuestions: string[];
    mandatoryDocuments: string[];
  }>;
}

// ---------------------------------------------------------------------------
// RFQ (re-exported shape from the existing file, kept here for the index)
// ---------------------------------------------------------------------------

export { SAMPLE_RFQS, getSampleRFQ } from './sample-rfqs';
import { SAMPLE_RFQS } from './sample-rfqs';

// ===========================================================================
// Data
// ===========================================================================

const REQ_LINES: Array<[string, string, number, string, number]> = [
  ['Corrugated mailer boxes, small (approx. 230 × 150 × 100 mm)', 'D2C order fulfilment — small parcels', 22000, 'pcs', 11],
  ['Corrugated mailer boxes, medium (approx. 305 × 230 × 100 mm)', 'D2C order fulfilment — apparel & kits', 10000, 'pcs', 14],
  ['Corrugated RSC shipper cartons, single wall, printed', 'Retail replenishment shippers, 1–2 colour brand print', 26000, 'pcs', 18],
  ['Corrugated RSC cartons, double wall', 'Heavier finished-goods despatch to distributors', 32000, 'pcs', 34],
  ['Heavy-duty / triple wall cartons', 'Export and machinery spares packing', 6800, 'pcs', 78],
  ['Die-cut trays and telescopic boxes', 'Line-side kitting and shelf-ready packs', 30000, 'pcs', 22],
  ['Fitments — partitions / inserts / corner protectors / layer pads', 'In-box protection for glassware and electronics', 60000, 'set', 9],
  ['Speciality cartons — wardrobe, long-goods, pallet boxes', 'Relocation projects and oversize spares', 4800, 'pcs', 210],
  ['Bottle-pack cartons with dividers (6 & 12)', 'Beverage sampling and gifting packs', 20000, 'pcs', 26],
  ['E-commerce returns cartons with double peel-seal', 'Reverse logistics for the online channel', 25000, 'pcs', 15],
  ['Archive / storage cartons with integrated lid', 'Records management, 12-month rollout', 6000, 'pcs', 32],
  ['Fruit / produce ventilated crates, water-resistant', 'Fresh category pilot, 3 regions', 10000, 'pcs', 28],
  ['Fragile-print cartons (all-face "FRAGILE")', 'Glass and ceramics despatch', 7000, 'pcs', 34],
  ['Void-fill / cushioning fan-fold', 'Pack-bench void fill across 4 sites', 40000, 'pcs', 6],
  ['Shelf-ready display shippers, 4-colour', 'Modern-trade promotional displays', 4000, 'pcs', 48],
];

export const SAMPLE_REQUISITION: SampleRequisition = {
  meta: {
    slug: 'packaging-item-request',
    kind: 'requisition',
    fileName: 'PR-2026-0417_Packaging_Item_Request.pdf',
    title: 'Business-Approved Item Request — Corrugated Packaging',
    summary:
      'Purchase requisition PR-2026-0417 raised by Operations and approved up to VP level: 15 packaging item groups, ~INR 2.1 crore estimated annual value, 12-month agreement requested.',
    relatedSlugs: ['procurement-policy-indirect', 'corrugated-packaging'],
  },
  reqNo: 'PR-2026-0417',
  raisedBy: {
    name: 'S. Kulkarni',
    title: 'Packaging Development Lead',
    department: 'Operations – Packaging & Warehousing',
    date: '28 Aug 2026',
  },
  costCentre: 'OPS-PKG-4100',
  neededBy: 'Agreement to be in place before 1 Oct 2026 (peak season build)',
  businessJustification:
    'Current corrugated packaging is bought reactively against 30+ open purchase orders across four ' +
    'plants, with no consolidated pricing and frequent stock-outs of mailers and double-wall shippers ' +
    'during peak. Volumes have grown ~34% year on year driven by the D2C channel. Consolidating demand ' +
    'into a single 12-month call-off agreement is expected to reduce unit cost by 8–12%, cut expedite ' +
    'freight, and secure buffer stock for the top runners. Sustainability targets also require a move ' +
    'to a minimum 70% recycled-fibre board with documented recyclability.',
  budgetLine: 'FY26-27 Indirect Opex — Packaging Consumables (approved in AOP)',
  estimatedAnnualValue: 21_060_000,
  currency: 'INR',
  approvals: [
    {
      level: 'Level 1 — Department Manager',
      name: 'A. Iyer',
      title: 'Head of Packaging & Warehousing',
      date: '29 Aug 2026',
      note: 'Demand figures and item grouping verified against plant consumption data.',
    },
    {
      level: 'Level 2 — Finance Business Partner',
      name: 'M. DaCosta',
      title: 'FP&A Manager, Operations',
      date: '1 Sep 2026',
      note: 'Within AOP budget line; savings assumption of 8–12% accepted for tracking.',
    },
    {
      level: 'Level 3 — Director, Operations',
      name: 'P. Raghavan',
      title: 'Director, Supply Chain',
      date: '2 Sep 2026',
      note: 'Approved. Single-supplier award preferred but split permitted if it improves resilience.',
    },
    {
      level: 'Level 4 — VP (spend > INR 1 crore per procurement policy §3)',
      name: 'K. Sinha',
      title: 'VP, Manufacturing & Supply Chain',
      date: '3 Sep 2026',
      note: 'Approved for competitive RFQ. Minimum 3 quotes. Sustainability and buffer-stock clauses to be mandatory.',
    },
  ],
  lines: REQ_LINES.map(([item, purpose, annualQty, unit, estUnitCost], i) => ({
    line: i + 1,
    item,
    purpose,
    annualQty,
    unit,
    estUnitCost,
  })),
  notesToProcurement: [
    'Run as a competitive RFQ to at least 5 suppliers; award may be split by item group.',
    'Requested commercial model: 12-month call-off with monthly releases and DDP delivery to Chakan.',
    'Board must be minimum 70% recycled fibre and fully recyclable — see procurement policy §7.2 (packaging).',
    'Hold two weeks buffer stock for the five highest-volume item groups.',
    'Line quantities are indicative (± 20%) and not a firm commitment.',
    'Target agreement start: first delivery week of Oct 2026.',
  ],
};

// ---------------------------------------------------------------------------

export const SAMPLE_POLICY: SamplePolicy = {
  meta: {
    slug: 'procurement-policy-indirect',
    kind: 'policy',
    fileName: 'POL-PROC-07_Indirect_Procurement_Policy.pdf',
    title: 'Procurement Policy — Indirect Goods & Services',
    summary:
      'POL-PROC-07 v3.2. Approval matrix by spend band, minimum-quote rules, and category-specific requirements — including the packaging rules that drive the commercial fields and quality questions in the RFQ.',
    relatedSlugs: ['packaging-item-request', 'corrugated-packaging'],
  },
  policyNo: 'POL-PROC-07',
  version: 'v3.2',
  effectiveDate: '1 Apr 2026',
  owner: 'Chief Procurement Officer',
  appliesTo:
    'All indirect (non-production) purchases of goods and services by any ABC Manufacturing entity in India.',
  purpose:
    'To ensure procurement is fair, competitive, compliant and delivers value for money, and to define ' +
    'the authority, competition and documentation required for each level of spend.',
  approvalMatrix: [
    { band: 'Up to INR 5 lakh', approver: 'Department Manager', competition: '1 quote (preferred supplier list)' },
    { band: 'INR 5 lakh – INR 25 lakh', approver: 'Director', competition: 'Minimum 2 written quotes' },
    { band: 'INR 25 lakh – INR 1 crore', approver: 'Director + Finance Business Partner', competition: 'Minimum 3 quotes via RFQ' },
    { band: 'Above INR 1 crore', approver: 'VP + CPO', competition: 'Competitive RFQ, minimum 3 quotes, sourcing plan required' },
  ],
  clauses: [
    {
      ref: '§3',
      heading: 'Authority & competition',
      body:
        'No purchase may be split to avoid an approval threshold. The approval band is set by the total ' +
        'committed value of the agreement, including all option years. Purchases above INR 1 crore require a ' +
        'competitive RFQ issued to at least five suppliers where a competitive market exists.',
    },
    {
      ref: '§4',
      heading: 'Supplier eligibility',
      body:
        'Suppliers must have valid business registration and GSTIN, no undisclosed conflict of interest, ' +
        'and must accept the ABC Manufacturing Supplier Code of Conduct. For agreements above INR 25 lakh the ' +
        'supplier must hold a current ISO 9001 certificate or an approved equivalent.',
    },
    {
      ref: '§5',
      heading: 'Commercial information to be requested',
      body:
        'Every RFQ must require, per line item: unit price, currency, unit of measurement, minimum order ' +
        'quantity, lead time, applicable taxes (GST %), and freight treatment. Where tooling or one-time ' +
        'set-up costs apply they must be quoted separately. Price validity of at least 60 days is required.',
    },
    {
      ref: '§6',
      heading: 'Evaluation & award',
      body:
        'Award is on best value, not lowest price alone. The evaluation must consider total cost of ownership, ' +
        'delivery performance, quality system, and sustainability. Award may be split across suppliers where ' +
        'this improves resilience. All evaluations and the award rationale must be documented.',
    },
    {
      ref: '§7',
      heading: 'Category requirements',
      body:
        'Category-specific mandatory requirements are set out in the table below and must be included in the ' +
        'RFQ in addition to the general rules above.',
    },
    {
      ref: '§7.2',
      heading: 'Packaging & corrugated materials',
      body:
        'Corrugated and fibre-based packaging must be minimum 70% recycled content and fully recyclable. ' +
        'Suppliers must evidence FSC or PEFC chain-of-custody, state board grade and edge crush / bursting ' +
        'strength per item, operate a documented incoming and in-process quality inspection, and provide ' +
        'pre-production samples with a first-article inspection report. For annual volumes above INR 1 crore the ' +
        'supplier must hold two weeks of buffer stock for the highest-volume items and provide EPR / plastic ' +
        'and packaging waste compliance documentation for India.',
    },
    {
      ref: '§8',
      heading: 'Contract terms',
      body:
        'Standard terms apply unless a documented exception is approved: Net 45 payment, DDP delivery, ' +
        'at least 98% on-time-in-full service level, defect replacement within 5 working days at supplier cost, ' +
        'price firm for 6 months then index-linked and capped, and liquidated damages for delay.',
    },
    {
      ref: '§9',
      heading: 'Records & confidentiality',
      body:
        'All RFQ documents, quotes and evaluations must be retained for 7 years. RFQ content is confidential ' +
        'and must not be shared outside the evaluation team without written approval.',
    },
  ],
  categoryRules: [
    {
      category: 'Packaging & corrugated materials',
      mandatoryCommercialFields: [
        'Unit price (per line item, ex-taxes)',
        'Currency',
        'Unit of measurement',
        'Minimum order quantity (MOQ)',
        'Standard lead time from call-off',
        'Applicable GST %',
        'Freight / transport treatment',
        'Tooling / die charges (one-time), quoted separately',
        'Volume discount schedule',
        'Price validity period (at least 60 days)',
      ],
      mandatoryQuestions: [
        'Current ISO 9001 certification (attach certificate)',
        'FSC or PEFC chain-of-custody certification',
        'Recycled fibre content (%) of the board supplied',
        'Ability to meet specified edge crush test / bursting strength per item',
        'Documented incoming and in-process quality inspection procedure',
        'Pre-production samples and first-article inspection report',
        'Comparable annual volume supplied in the last 3 years (2 references)',
        'Maximum monthly production capacity for double-wall board',
        'Two weeks buffer stock for the top 5 items by volume',
        'EPR / plastic and packaging waste compliance documentation for India',
      ],
      mandatoryDocuments: [
        'ISO 9001 certificate',
        'FSC / PEFC chain-of-custody certificate',
        'Sample first-article / Certificate of Analysis template',
        'GST registration certificate',
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Index used by the Sample docs page
// ---------------------------------------------------------------------------

export interface SampleDocIndexEntry extends SampleDocMeta {
  category: string;
}

export function listSampleDocs(): SampleDocIndexEntry[] {
  const rfqEntries: SampleDocIndexEntry[] = SAMPLE_RFQS.map((r) => ({
    slug: r.slug,
    kind: 'rfq' as const,
    fileName: r.fileName,
    title: r.title,
    summary: `Request for Quotation — ${r.buyer.name}, ${r.lineItems.length} line items, ${r.currency}.`,
    relatedSlugs: ['packaging-item-request', 'procurement-policy-indirect'],
    category: r.category,
  }));

  return [
    { ...SAMPLE_REQUISITION.meta, category: 'Source document' },
    { ...SAMPLE_POLICY.meta, category: 'Source document' },
    ...rfqEntries,
  ];
}

export function getSampleRequisition(slug: string): SampleRequisition | undefined {
  return SAMPLE_REQUISITION.meta.slug === slug ? SAMPLE_REQUISITION : undefined;
}

export function getSamplePolicy(slug: string): SamplePolicy | undefined {
  return SAMPLE_POLICY.meta.slug === slug ? SAMPLE_POLICY : undefined;
}
