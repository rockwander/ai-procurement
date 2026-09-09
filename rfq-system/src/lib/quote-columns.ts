import type { FormSchema } from '@/lib/form-schema';
import {
  normaliseLineResponse,
  normaliseLinePrice,
  committedQty,
  type RFQLineForResponse,
} from '@/lib/line-response';

export interface QuoteRow {
  invitationId: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalAmount: number | null;
  currency: string;
  notes: string | null;
  submittedAt: string | null;
  formData: Record<string, unknown>;
  lineItems: Array<Record<string, unknown>>;
}

export interface LineCoverage {
  priced: number;
  partial: number;
  noBid: number;
  total: number;
  foreignCurrency: number;
  ambiguousUom: number;
}

/** Per-row summary of how completely and cleanly the supplier answered. */
export function lineCoverage(
  row: QuoteRow,
  rfqLines: Array<{ id: string; itemDescription: string; quantity: number; unit: string }>,
  rfqCurrency: string
): LineCoverage {
  const byId = new Map(row.lineItems.map((li) => [String(li.itemId), li]));
  const cov: LineCoverage = {
    priced: 0,
    partial: 0,
    noBid: 0,
    total: rfqLines.length,
    foreignCurrency: 0,
    ambiguousUom: 0,
  };
  for (const line of rfqLines) {
    const raw = byId.get(line.id);
    const r = normaliseLineResponse(
      raw,
      { id: line.id, itemDescription: line.itemDescription, quantity: line.quantity, unit: line.unit },
      rfqCurrency
    );
    if (r.canSupply === 'no') {
      cov.noBid++;
      continue;
    }
    if (r.canSupply === 'partial' || committedQty(r, line.quantity) < line.quantity) {
      cov.partial++;
    }
    const norm = normaliseLinePrice(r, rfqCurrency);
    if (r.unitPrice != null && r.unitPrice > 0) cov.priced++;
    if (norm.currencyDiffers && r.unitPrice != null) cov.foreignCurrency++;
    if (norm.uomAmbiguous) cov.ambiguousUom++;
  }
  return cov;
}

export interface ColumnDef {
  key: string;
  label: string;
  /** 'parent' = top-level quote attribute, 'child' = form field or line-item price */
  group: 'parent' | 'questionnaire' | 'lineitem';
  accessor: (row: QuoteRow) => string | number | null;
  numeric: boolean;
}

/**
 * Build the full column set for the comparison table from the RFQ's form schema
 * and line items. Parent columns always exist; questionnaire columns come from
 * the form fields; line-item columns are unit price per RFQ line item.
 */
export function buildColumns(
  formSchema: FormSchema | null,
  lineItems: Array<{ id: string; itemDescription: string; quantity?: number; unit?: string }>,
  rfqCurrency = 'INR'
): ColumnDef[] {
  const rfqLines = lineItems.map((li) => ({
    id: li.id,
    itemDescription: li.itemDescription,
    quantity: li.quantity ?? 0,
    unit: li.unit ?? '',
  }));

  const cols: ColumnDef[] = [
    {
      key: 'supplierName',
      label: 'Supplier',
      group: 'parent',
      accessor: (r) => r.supplierName,
      numeric: false,
    },
    {
      key: 'status',
      label: 'Status',
      group: 'parent',
      accessor: (r) => r.status,
      numeric: false,
    },
    {
      key: 'coverage',
      label: 'Lines priced',
      group: 'parent',
      numeric: true,
      accessor: (r) => lineCoverage(r, rfqLines, rfqCurrency).priced,
    },
    {
      key: 'partialLines',
      label: 'Partial / no-bid',
      group: 'parent',
      numeric: false,
      accessor: (r) => {
        const c = lineCoverage(r, rfqLines, rfqCurrency);
        if (c.partial === 0 && c.noBid === 0) return '—';
        return `${c.partial} partial, ${c.noBid} no-bid`;
      },
    },
    {
      key: 'currencyFlag',
      label: 'FX',
      group: 'parent',
      numeric: false,
      accessor: (r) => {
        const c = lineCoverage(r, rfqLines, rfqCurrency);
        return c.foreignCurrency > 0 ? `${c.foreignCurrency} line(s) non-${rfqCurrency}` : '—';
      },
    },
    {
      key: 'totalAmount',
      label: `Total (${rfqCurrency}, comparable lines)`,
      group: 'parent',
      accessor: (r) => r.totalAmount,
      numeric: true,
    },
    {
      key: 'notes',
      label: 'Notes',
      group: 'parent',
      accessor: (r) => r.notes,
      numeric: false,
    },
  ];

  for (const field of formSchema?.fields ?? []) {
    cols.push({
      key: `fd:${field.id}`,
      label: field.label,
      group: 'questionnaire',
      numeric: field.type === 'number',
      accessor: (r) => {
        const v = r.formData?.[field.id];
        if (v == null) return null;
        return field.type === 'number' ? Number(v) : String(v);
      },
    });
  }

  for (const li of lineItems) {
    const line: RFQLineForResponse = {
      id: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity ?? 0,
      unit: li.unit ?? '',
    };
    // Normalised unit price (per the RFQ's asked unit, quoted currency).
    cols.push({
      key: `li:${li.id}`,
      label: `${li.itemDescription} — unit price`,
      group: 'lineitem',
      numeric: true,
      accessor: (r) => {
        const match = (r.lineItems ?? []).find((x) => String(x.itemId) === li.id);
        if (!match) return null;
        const resp = normaliseLineResponse(match, line, rfqCurrency);
        if (resp.canSupply === 'no') return null;
        return normaliseLinePrice(resp, rfqCurrency).pricePerAskedUnit;
      },
    });
    // Can-supply status for this line.
    cols.push({
      key: `lis:${li.id}`,
      label: `${li.itemDescription} — can supply`,
      group: 'lineitem',
      numeric: false,
      accessor: (r) => {
        const match = (r.lineItems ?? []).find((x) => String(x.itemId) === li.id);
        if (!match) return null;
        const resp = normaliseLineResponse(match, line, rfqCurrency);
        if (resp.canSupply === 'no') return 'no-bid';
        const qty = committedQty(resp, line.quantity);
        if (resp.canSupply === 'partial' || qty < line.quantity) {
          return `partial (${qty.toLocaleString()}/${line.quantity.toLocaleString()})`;
        }
        return 'full';
      },
    });
  }

  return cols;
}

export type ColumnTab = 'lineitems' | 'questionnaire';

/**
 * Which tab a column shows under in the comparison view.
 * Line-items tab: the commercial picture — supplier, totals, per-line price &
 * coverage. Questionnaire tab: the buyer's custom questions (Notes is rendered
 * separately as flagged bullets, not as a column).
 */
export function columnTab(col: ColumnDef): ColumnTab {
  return col.group === 'questionnaire' ? 'questionnaire' : 'lineitems';
}

/** Columns to render for a given tab, in their natural order. */
export function columnsForTab(columns: ColumnDef[], tab: ColumnTab): ColumnDef[] {
  if (tab === 'questionnaire') {
    // keep supplier as an anchor so rows are identifiable
    const anchor = columns.filter((c) => c.key === 'supplierName');
    return [...anchor, ...columns.filter((c) => c.group === 'questionnaire')];
  }
  return columns.filter((c) => c.group !== 'questionnaire' && c.key !== 'notes');
}

export type FilterOp = 'contains' | 'eq' | 'lt' | 'gt';

export interface Filter {
  columnKey: string;
  op: FilterOp;
  value: string;
}

export function applyFilters(
  rows: QuoteRow[],
  columns: ColumnDef[],
  filters: Filter[]
): QuoteRow[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return rows.filter((row) =>
    filters.every((f) => {
      const col = byKey.get(f.columnKey);
      if (!col || !f.value) return true;
      const cell = col.accessor(row);
      if (cell == null) return false;
      if (col.numeric) {
        const cellNum = Number(cell);
        const target = Number(f.value);
        if (Number.isNaN(target)) return true;
        if (f.op === 'lt') return cellNum < target;
        if (f.op === 'gt') return cellNum > target;
        return cellNum === target;
      }
      const cellStr = String(cell).toLowerCase();
      const target = f.value.toLowerCase();
      if (f.op === 'eq') return cellStr === target;
      return cellStr.includes(target);
    })
  );
}

export function sortRows(
  rows: QuoteRow[],
  columns: ColumnDef[],
  sortKey: string | null,
  dir: 'asc' | 'desc'
): QuoteRow[] {
  if (!sortKey) return rows;
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = col.accessor(a);
    const bv = col.accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (col.numeric) return Number(av) - Number(bv);
    return String(av).localeCompare(String(bv));
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}
