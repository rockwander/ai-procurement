import type { FormSchema } from '@/lib/form-schema';
import {
  normaliseLineResponse,
  normaliseLinePrice,
  committedQty,
  type RFQLineForResponse,
} from '@/lib/line-response';
import type { QuoteRow } from '@/lib/quote-columns';

/**
 * The comparison view transposed: suppliers run across the columns so a single
 * row compares every supplier on one line-item field (or one questionnaire
 * question). Two grids:
 *
 *  - Line-items grid: row per RFQ line item; column-GROUPS are the per-line
 *    fields (Unit price, Can supply, Committed qty, Lead time); under each group
 *    one sub-column per supplier.
 *  - Questionnaire grid: row per question; one column per supplier.
 *
 * Cell values are formatted strings (or null → "—"). `numeric` on a group says
 * whether its cells sort/right-align as numbers.
 */

export interface SupplierCol {
  invitationId: string;
  supplierId: string;
  supplierName: string;
}

export interface LineFieldGroup {
  key: string;
  label: string;
  numeric: boolean;
  /** hidden until the buyer turns it on in the Show / hide menu */
  defaultHidden?: boolean;
  /** raw comparable value for a supplier on a line — number, string, or null */
  value: (lineId: string, supplier: QuoteRow) => number | string | null;
  /** display string for a cell */
  format: (v: number | string | null) => string;
}

export interface LineMatrixRow {
  lineId: string;
  itemDescription: string;
  askedQuantity: number;
  unit: string;
}

export interface LineMatrix {
  suppliers: SupplierCol[];
  groups: LineFieldGroup[];
  rows: LineMatrixRow[];
}

export interface QuestionnaireMatrix {
  suppliers: SupplierCol[];
  rows: Array<{
    fieldId: string;
    label: string;
    numeric: boolean;
    value: (supplier: QuoteRow) => number | string | null;
  }>;
}

const dash = (v: number | string | null) =>
  v == null || v === '' ? '—' : String(v);

const num = (v: number | string | null) =>
  v == null || v === ''
    ? '—'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Build the line-items comparison grid.
 * `submittedRows` should already be filtered to submitted quotes and ordered
 * how the caller wants the supplier columns to appear.
 */
export function buildLineMatrix(
  lineItems: Array<{ id: string; itemDescription: string; quantity?: number; unit?: string }>,
  submittedRows: QuoteRow[],
  rfqCurrency = 'INR'
): LineMatrix {
  const suppliers: SupplierCol[] = submittedRows.map((r) => ({
    invitationId: r.invitationId,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
  }));

  const lineById = new Map<string, RFQLineForResponse>(
    lineItems.map((li) => [
      li.id,
      {
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity ?? 0,
        unit: li.unit ?? '',
      },
    ])
  );

  const resp = (lineId: string, supplier: QuoteRow) => {
    const line = lineById.get(lineId);
    if (!line) return null;
    const match = (supplier.lineItems ?? []).find(
      (x) => String(x.itemId) === lineId
    );
    if (!match) return null;
    return normaliseLineResponse(match, line, rfqCurrency);
  };

  const groups: LineFieldGroup[] = [
    {
      key: 'unitPrice',
      label: `Unit price (${rfqCurrency}/asked unit)`,
      numeric: true,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        if (!r || r.canSupply === 'no') return null;
        return normaliseLinePrice(r, rfqCurrency).pricePerAskedUnit;
      },
      format: num,
    },
    {
      key: 'canSupply',
      label: 'Can supply',
      numeric: false,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        if (!r) return null;
        if (r.canSupply === 'no') return 'no-bid';
        const line = lineById.get(lineId)!;
        const qty = committedQty(r, line.quantity);
        if (r.canSupply === 'partial' || qty < line.quantity) return 'partial';
        return 'full';
      },
      format: dash,
    },
    {
      key: 'committedQty',
      label: 'Committed qty / asked',
      numeric: false,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        const line = lineById.get(lineId)!;
        if (!r || r.canSupply === 'no') return `0 / ${line.quantity.toLocaleString()}`;
        const qty = committedQty(r, line.quantity);
        return `${qty.toLocaleString()} / ${line.quantity.toLocaleString()}`;
      },
      format: dash,
    },
    {
      key: 'leadTime',
      label: 'Lead time (days)',
      numeric: true,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        return r?.leadTimeDays ?? null;
      },
      format: num,
    },
    {
      key: 'moq',
      label: 'MOQ',
      numeric: true,
      defaultHidden: true,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        return r?.moq ?? null;
      },
      format: num,
    },
    {
      key: 'currency',
      label: 'Quoted currency',
      numeric: false,
      defaultHidden: true,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        if (!r || r.canSupply === 'no') return null;
        return r.currency || rfqCurrency;
      },
      format: dash,
    },
    {
      key: 'quotedUom',
      label: 'Quoted unit',
      numeric: false,
      defaultHidden: true,
      value: (lineId, s) => {
        const r = resp(lineId, s);
        if (!r || r.canSupply === 'no') return null;
        return r.quotedUom || null;
      },
      format: dash,
    },
  ];

  const rows: LineMatrixRow[] = lineItems.map((li) => ({
    lineId: li.id,
    itemDescription: li.itemDescription,
    askedQuantity: li.quantity ?? 0,
    unit: li.unit ?? '',
  }));

  return { suppliers, groups, rows };
}

/**
 * Build the questionnaire comparison grid: row per questionnaire question
 * (formSchema fields in the questionnaire section), one column per supplier.
 */
export function buildQuestionnaireMatrix(
  formSchema: FormSchema | null,
  submittedRows: QuoteRow[]
): QuestionnaireMatrix {
  const suppliers: SupplierCol[] = submittedRows.map((r) => ({
    invitationId: r.invitationId,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
  }));

  const fields = (formSchema?.fields ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const rows = fields.map((f) => ({
    fieldId: f.id,
    label: f.label,
    numeric: f.type === 'number',
    value: (supplier: QuoteRow) => {
      const v = supplier.formData?.[f.id];
      if (v == null || v === '') return null;
      return f.type === 'number' ? Number(v) : String(v);
    },
  }));

  return { suppliers, rows };
}
