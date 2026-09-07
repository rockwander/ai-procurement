// Sample buyer-issued RFQ documents, used to seed the "Sample docs" page so
// the create-RFQ upload flow can be exercised end-to-end. These are plain
// data; the PDF layout lives in src/lib/pdf/sample-rfq-pdf.tsx.

export interface SampleLineItem {
  line: number;
  item: string;
  specification: string;
  qty: number;
  unit: string;
}

export interface SampleRFQ {
  slug: string;
  fileName: string;
  title: string;
  category: string;
  buyer: {
    name: string;
    address: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  };
  rfqId: string;
  issueDate: string;
  quoteDeadline: string;
  expectedDelivery: string;
  currency: string;
  validity: string;
  incoterms: string;
  paymentTerms: string;
  scope: string;
  lineItems: SampleLineItem[];
  commercialFields: string[];
  questionnaire: string[];
  terms: string[];
}

// ---- Corrugated packaging: 30 line items ---------------------------------

function corrugatedLineItems(): SampleLineItem[] {
  // 30 realistic RSC (regular slotted carton) variants — mix of ply, size,
  // print, and special features a real packaging RFQ would list.
  const rows: Array<[string, string, number, string]> = [
    ['Carton Box A — Mailer', 'Single wall 3-ply, 229 × 152 × 102 mm, kraft, 125 gsm liner / 115 gsm flute, plain', 12000, 'pcs'],
    ['Carton Box B — Mailer', 'Single wall 3-ply, 305 × 229 × 102 mm, kraft, 125 gsm liner, plain', 10000, 'pcs'],
    ['Carton Box C — RSC', 'Single wall 3-ply, 305 × 254 × 254 mm, 150 gsm liner, 1-colour flexo (logo)', 9000, 'pcs'],
    ['Carton Box D — RSC', 'Single wall 3-ply, 400 × 300 × 300 mm, 150 gsm liner, 1-colour flexo', 8000, 'pcs'],
    ['Carton Box E — RSC', 'Double wall 5-ply, 457 × 305 × 305 mm, 180 gsm liner, plain', 7500, 'pcs'],
    ['Carton Box F — RSC', 'Double wall 5-ply, 508 × 356 × 356 mm, 180 gsm liner, 2-colour flexo', 6000, 'pcs'],
    ['Carton Box G — RSC', 'Double wall 5-ply, 610 × 457 × 457 mm, 200 gsm liner, plain', 5000, 'pcs'],
    ['Carton Box H — Heavy duty', 'Triple wall 7-ply, 762 × 508 × 508 mm, 200 gsm liner, edge crush min. 14 kN/m', 3000, 'pcs'],
    ['Carton Box I — Flat pack', 'Single wall 3-ply, 600 × 400 × 120 mm, die-cut, self-lock base, plain', 8000, 'pcs'],
    ['Carton Box J — Book wrap', 'Single wall 3-ply, 320 × 250 × up to 80 mm adjustable, peel-and-seal strip', 15000, 'pcs'],
    ['Carton Box K — Telescopic lid', '2-piece 5-ply, base 350 × 350 × 200 mm + lid, 180 gsm liner', 4000, 'pcs'],
    ['Carton Box L — Tray', 'Die-cut 3-ply tray, 400 × 300 × 75 mm, 4-corner glued, plain', 10000, 'pcs'],
    ['Carton Box M — Tray', 'Die-cut 5-ply tray, 600 × 400 × 100 mm, stackable, plain', 6000, 'pcs'],
    ['Carton Box N — Partition set', '5-ply inserts for Box F, 6-cell egg-crate, kraft', 6000, 'set'],
    ['Carton Box O — Partition set', '3-ply inserts for Box D, 4-cell, kraft', 8000, 'set'],
    ['Carton Box P — Pizza style', 'Single wall 3-ply, 300 × 300 × 40 mm, tuck-in lid, food-grade liner', 20000, 'pcs'],
    ['Carton Box Q — Long goods', 'Double wall 5-ply, 1200 × 150 × 150 mm, telescopic ends, plain', 2500, 'pcs'],
    ['Carton Box R — Wardrobe', 'Double wall 5-ply, 500 × 500 × 1000 mm, with hanging bar, 200 gsm liner', 1500, 'pcs'],
    ['Carton Box S — Bottle 6-pack', '3-ply with die-cut divider, 250 × 170 × 320 mm, 1-colour print', 12000, 'pcs'],
    ['Carton Box T — Bottle 12-pack', '5-ply with divider, 340 × 255 × 320 mm, 2-colour print', 8000, 'pcs'],
    ['Carton Box U — E-comm returns', 'Single wall 3-ply, 350 × 250 × 150 mm, double peel-seal strip, tear-off', 25000, 'pcs'],
    ['Carton Box V — Archive', 'Double wall 5-ply, 400 × 320 × 260 mm, integrated lid + hand holes', 6000, 'pcs'],
    ['Carton Box W — Pallet box', 'Triple wall 7-ply, 1160 × 1160 × 785 mm, 5-panel, fits Euro pallet', 800, 'pcs'],
    ['Carton Box X — Corner protectors', 'Moulded pulp / 5-ply L-profile, 600 mm arm, 60 mm wing', 20000, 'pcs'],
    ['Carton Box Y — Layer pads', '3-ply sheet, 1150 × 1150 mm, kraft, for pallet interleaving', 30000, 'pcs'],
    ['Carton Box Z — Fruit crate', 'Die-cut 5-ply ventilated, 400 × 300 × 180 mm, wax-free water-resistant coat', 10000, 'pcs'],
    ['Carton Box AA — Fragile', 'Double wall 5-ply, 300 × 300 × 300 mm, "FRAGILE" 2-colour print all faces', 7000, 'pcs'],
    ['Carton Box AB — Cushion insert', '3-ply fan-fold, 300 × 300 mm nominal, kraft, for void fill', 40000, 'pcs'],
    ['Carton Box AC — Display shipper', '5-ply die-cut shelf-ready, 400 × 300 × 300 mm, perforated front, 4-colour', 4000, 'pcs'],
    ['Carton Box AD — Export', 'Double wall 5-ply, 585 × 385 × 385 mm, ISPM-15 exempt, edge crush min. 9 kN/m, plain', 5000, 'pcs'],
  ];
  return rows.map(([item, spec, qty, unit], i) => ({
    line: i + 1,
    item,
    specification: spec,
    qty,
    unit,
  }));
}

export const SAMPLE_RFQS: SampleRFQ[] = [
  {
    slug: 'corrugated-packaging',
    fileName: 'RFQ-2026-001_Corrugated_Packaging.pdf',
    title: 'Corrugated Packaging — Annual Supply',
    category: 'Packaging',
    buyer: {
      name: 'ABC Manufacturing Pvt. Ltd.',
      address: 'Plot 42, MIDC Industrial Area, Chakan, Pune 410501, India',
      contactName: 'R. Menon, Category Manager – Indirect Procurement',
      contactEmail: 'procurement@abcmanufacturing.example',
      contactPhone: '+91 20 4123 8800',
    },
    rfqId: 'RFQ-2026-001',
    issueDate: '5 Sep 2026',
    quoteDeadline: '15 Sep 2026, 17:00 IST',
    expectedDelivery: 'Monthly call-off, first delivery week of Oct 2026, 12-month agreement',
    currency: 'INR',
    validity: 'Quote to remain valid for 90 days from the deadline',
    incoterms: 'DDP – ABC Manufacturing warehouse, Chakan (Incoterms 2020)',
    paymentTerms: 'Net 45 days from receipt of goods and valid invoice',
    scope:
      'ABC Manufacturing invites sealed quotations for the supply of corrugated ' +
      'fibreboard packaging as listed below, on a 12-month call-off agreement with ' +
      'monthly releases. Estimated annual volumes are indicative (± 20%) and do not ' +
      'constitute a firm commitment. Award may be split across up to two suppliers ' +
      'by item group. All board must be made from a minimum 70% recycled fibre and ' +
      'be fully recyclable.',
    lineItems: corrugatedLineItems(),
    commercialFields: [
      'Unit price (INR, ex-taxes)',
      'Currency',
      'Unit of measurement',
      'Minimum order quantity (MOQ)',
      'Standard lead time (working days) from call-off',
      'Applicable GST %',
      'Freight / transport charges (if not DDP)',
      'Volume discount schedule, if any',
      'Tooling / die charges (one-time), if applicable',
      'Price validity period',
    ],
    questionnaire: [
      'Do you hold a current ISO 9001 certification? (attach certificate)',
      'Do you hold FSC or PEFC chain-of-custody certification?',
      'Can you meet the specified edge crush test (ECT) / bursting strength for each item?',
      'What is the recycled fibre content (%) of the board you will supply?',
      'Do you operate a documented incoming and in-process quality inspection procedure?',
      'Can you provide pre-production samples and a first-article inspection report?',
      'Have you supplied corrugated packaging at comparable annual volume in the last 3 years? (give 2 references)',
      'What is your maximum monthly production capacity for double-wall board?',
      'Can you hold two weeks of buffer stock for the top 5 items by volume?',
      'Do you provide EPR / plastic-and-packaging waste compliance documentation for India?',
    ],
    terms: [
      'Delivery location: ABC Manufacturing central warehouse, Chakan, Pune. Deliveries accepted Mon–Sat, 09:00–17:00.',
      'Packaging & palletisation: goods to be shrink-wrapped on heat-treated pallets, max 1.6 m stack height, each pallet labelled with item code, quantity, batch and production date.',
      'Quality: each shipment to be accompanied by a Certificate of Analysis stating board grade, ECT/BCT, and moisture content. AQL 1.0 (major) / 2.5 (minor) per ISO 2859-1.',
      'Delivery commitment: at least 98% on-time-in-full measured monthly. Two consecutive months below 95% may lead to termination for cause.',
      'Warranty / replacement: defective or out-of-spec material to be replaced within 5 working days at supplier cost, including reverse logistics.',
      'Price: firm for the first 6 months. Thereafter adjustments only against a published kraftliner index, capped at ± 5% per quarter, with 30 days written notice and supporting data.',
      'Taxes & freight: prices exclusive of GST; freight included under DDP. Any statutory change in taxes to be passed through at cost.',
      'Liquidated damages: 0.5% of the affected order value per week of delay, to a maximum of 5%.',
      'Compliance: supplier to comply with ABC Manufacturing Supplier Code of Conduct, applicable labour and environmental law, and anti-bribery legislation.',
      'Confidentiality: this RFQ and all attachments are confidential and must not be shared with third parties without written consent.',
    ],
  },
];

export function getSampleRFQ(slug: string): SampleRFQ | undefined {
  return SAMPLE_RFQS.find((r) => r.slug === slug);
}
