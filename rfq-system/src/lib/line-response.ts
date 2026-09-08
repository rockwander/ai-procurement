// The FIXED per-line-item response every supplier gives, on every RFQ.
//
// This is deliberately NOT buyer-configurable: the quote-comparison table and
// the NL-analysis agent need a stable, typed shape to reason over (normalise
// currency / UoM, detect partial coverage) rather than free-form fields to
// guess at. Buyer customisation lives in the questionnaire and in quote-level
// commercial fields — see MASTER_SPEC 2026-09-09.
//
// The supplier response FORM is a superset of the RFQ document (the PDF): the
// "can you supply this / this quantity" concept exists only in the form, not in
// anything the buyer states in the RFQ.

export type CanSupply = 'full' | 'partial' | 'no';

/** How a supplier declared their price is measured, so we can normalise it to
 *  the RFQ's asked unit before comparing. `factor` = asked-units per quoted-unit
 *  (e.g. "per 100" → 100; a price of ₹420 per 100 is ₹4.20 per piece). */
export const QUOTE_UOM_OPTIONS = [
  'per piece',
  'per set',
  'per pack',
  'per box',
  'per 100',
  'per 1000',
  'per kg',
  'per tonne',
  'per metre',
  'per litre',
] as const;
export type QuoteUom = (typeof QUOTE_UOM_OPTIONS)[number];

const UOM_FACTOR: Record<QuoteUom, number> = {
  'per piece': 1,
  'per set': 1,
  'per pack': 1,
  'per box': 1, // unknown pack size — flagged, not silently converted
  'per 100': 100,
  'per 1000': 1000,
  'per kg': 1,
  'per tonne': 1000,
  'per metre': 1,
  'per litre': 1,
};

export interface LineItemResponse {
  itemId: string; // rfq_line_items.id
  canSupply: CanSupply;
  unitPrice: number | null; // in `currency`, per `quotedUom`; null = not quoted
  currency: string; // defaults to the RFQ currency
  quotedUom: string; // one of QUOTE_UOM_OPTIONS; defaults to a sensible match of the asked unit
  availableQty: number | null; // null = "as asked"; a number below asked qty = partial
  leadTimeDays: number | null;
  moq: number | null;
}

export interface RFQLineForResponse {
  id: string;
  itemDescription: string;
  quantity: number; // asked qty
  unit: string; // asked unit
}

/** Map an RFQ line's asked unit to the closest quoted-UoM option. */
export function defaultQuotedUom(askedUnit: string): QuoteUom {
  const u = (askedUnit || '').trim().toLowerCase();
  if (/(^|\b)(set|sets)\b/.test(u)) return 'per set';
  if (/(^|\b)(pack|packs|pkt)\b/.test(u)) return 'per pack';
  if (/(^|\b)(box|boxes|carton|cartons)\b/.test(u)) return 'per box';
  if (/(^|\b)(kg|kilogram|kilo)\b/.test(u)) return 'per kg';
  if (/(^|\b)(tonne|ton|mt)\b/.test(u)) return 'per tonne';
  if (/(^|\b)(m|metre|meter|metres|meters)\b/.test(u)) return 'per metre';
  if (/(^|\b)(l|litre|liter|litres|liters)\b/.test(u)) return 'per litre';
  return 'per piece';
}

/** A blank/default response for one line, seeded from the RFQ line + currency. */
export function emptyLineResponse(
  line: RFQLineForResponse,
  rfqCurrency: string
): LineItemResponse {
  return {
    itemId: line.id,
    canSupply: 'full',
    unitPrice: null,
    currency: rfqCurrency || 'INR',
    quotedUom: defaultQuotedUom(line.unit),
    availableQty: null,
    leadTimeDays: null,
    moq: null,
  };
}

export interface NormalisedLinePrice {
  /** unit price expressed per the RFQ's asked unit, in the quoted currency */
  pricePerAskedUnit: number | null;
  /** true when we could not safely convert the quoted UoM (e.g. "per box") */
  uomAmbiguous: boolean;
  /** true when the supplier quoted a currency other than the RFQ currency */
  currencyDiffers: boolean;
}

/**
 * Convert a raw line response to a price per the RFQ's asked unit, flagging the
 * cases a buyer must not miss. Currency is NOT converted here (no FX rates in a
 * POC) — `currencyDiffers` surfaces it so the UI / agent can call it out.
 */
export function normaliseLinePrice(
  resp: LineItemResponse,
  rfqCurrency: string
): NormalisedLinePrice {
  const currencyDiffers =
    !!resp.currency &&
    !!rfqCurrency &&
    resp.currency.trim().toUpperCase() !== rfqCurrency.trim().toUpperCase();

  if (resp.unitPrice == null || !Number.isFinite(resp.unitPrice)) {
    return { pricePerAskedUnit: null, uomAmbiguous: false, currencyDiffers };
  }

  const uom = resp.quotedUom as QuoteUom;
  const factor = UOM_FACTOR[uom] ?? 1;
  // Container units ("per box" / "per pack" / "per set") have no known piece
  // count, so a price quoted that way can't be reduced to a per-unit number
  // we can compare against the others. Flag it for the buyer rather than
  // guessing.
  const uomAmbiguous = uom === 'per box' || uom === 'per pack' || uom === 'per set';

  return {
    pricePerAskedUnit: uomAmbiguous ? resp.unitPrice : resp.unitPrice / factor,
    uomAmbiguous,
    currencyDiffers,
  };
}

/** Effective quantity a supplier committed to for a line. */
export function committedQty(resp: LineItemResponse, askedQty: number): number {
  if (resp.canSupply === 'no') return 0;
  if (resp.availableQty != null && Number.isFinite(resp.availableQty)) {
    return Math.max(0, Math.min(resp.availableQty, askedQty));
  }
  return askedQty;
}

/** Coerce anything (old submissions, agent output, form state) to a valid
 *  LineItemResponse for a known RFQ line. */
export function normaliseLineResponse(
  raw: unknown,
  line: RFQLineForResponse,
  rfqCurrency: string
): LineItemResponse {
  const base = emptyLineResponse(line, rfqCurrency);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;

  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  // Legacy rows stored only { itemId, unitPrice, quantity, totalPrice }.
  const legacyPrice = num(r.unitPrice);

  const canSupplyRaw = String(r.canSupply ?? '').toLowerCase();
  const canSupply: CanSupply =
    canSupplyRaw === 'no' || canSupplyRaw === 'partial' || canSupplyRaw === 'full'
      ? (canSupplyRaw as CanSupply)
      : legacyPrice == null
      ? 'full' // unknown legacy row, no price — leave as full, price blank
      : 'full';

  const quotedUomRaw = String(r.quotedUom ?? '').toLowerCase();
  const quotedUom = (QUOTE_UOM_OPTIONS as readonly string[]).includes(quotedUomRaw)
    ? quotedUomRaw
    : base.quotedUom;

  return {
    itemId: line.id,
    canSupply,
    unitPrice: num(r.unitPrice),
    currency: String(r.currency ?? '').trim() || base.currency,
    quotedUom,
    availableQty: num(r.availableQty),
    leadTimeDays: num(r.leadTimeDays),
    moq: num(r.moq),
  };
}
