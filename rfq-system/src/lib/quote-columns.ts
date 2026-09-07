import type { FormSchema } from '@/lib/form-schema';

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
  lineItems: Array<{ id: string; itemDescription: string }>
): ColumnDef[] {
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
      key: 'totalAmount',
      label: 'Total ($)',
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
    cols.push({
      key: `li:${li.id}`,
      label: `${li.itemDescription} — unit $`,
      group: 'lineitem',
      numeric: true,
      accessor: (r) => {
        const match = (r.lineItems ?? []).find(
          (x) => String(x.itemId) === li.id
        );
        return match ? Number(match.unitPrice) : null;
      },
    });
  }

  return cols;
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
