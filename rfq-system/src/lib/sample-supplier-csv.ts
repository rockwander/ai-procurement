import {
  SupplierSubmission,
  quoteTotals,
} from '@/lib/sample-supplier-docs';

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** Supplier quotation as a flat CSV (a supplier's own price-list workbook export). */
export function supplierQuoteCsv(sub: SupplierSubmission): string {
  const t = quoteTotals(sub);
  const lines: string[] = [];
  lines.push(row(['Quotation', sub.quoteRef]));
  lines.push(row(['Supplier', sub.supplierName]));
  lines.push(row(['Contact', sub.contact.person, sub.contact.email, sub.contact.phone]));
  lines.push(row(['GSTIN', sub.contact.gstin]));
  lines.push(row(['Quote date', sub.quoteDate]));
  lines.push(row(['Currency', sub.currency]));
  lines.push(row(['Payment terms', sub.paymentTerms]));
  lines.push(row(['Incoterms', sub.incoterms]));
  lines.push(row(['Quote validity (days)', sub.validityDays]));
  lines.push(row(['GST %', sub.commercial.gstPercent]));
  lines.push(row(['Freight', sub.commercial.freight]));
  lines.push(row(['Tooling / die charges', sub.commercial.toolingCharges]));
  lines.push(row(['Volume discount', sub.commercial.volumeDiscount]));
  lines.push(row(['Price validity', sub.commercial.priceValidity]));
  lines.push('');
  lines.push(
    row(['Line', 'Item', 'Ask qty', 'Unit', 'Unit price (INR)', 'MOQ', 'Lead time (days)', 'Line total (INR)'])
  );
  for (const l of sub.lines) {
    const lineTotal = l.unitPrice != null ? Math.round(l.unitPrice * l.askQty) : null;
    lines.push(
      row([l.line, l.item, l.askQty, l.unit, l.unitPrice, l.moq, l.leadTimeDays, lineTotal])
    );
  }
  lines.push('');
  lines.push(row(['Lines priced', `${t.pricedLines} of ${t.totalLines}`]));
  lines.push(row(['Estimated quoted value (INR)', Math.round(t.estimatedValue)]));
  lines.push(row(['Notes', sub.notes]));
  return lines.join('\n') + '\n';
}

/** Questionnaire answers as CSV (question, answer). Blank answer = not provided. */
export function supplierFaqCsv(sub: SupplierSubmission): string {
  const lines: string[] = [];
  lines.push(row(['Supplier', sub.supplierName]));
  lines.push(row(['Quote ref', sub.quoteRef]));
  lines.push(row(['Date', sub.quoteDate]));
  lines.push('');
  lines.push(row(['#', 'Question', 'Answer']));
  sub.faq.forEach((a, i) => lines.push(row([i + 1, a.question, a.answer])));
  return lines.join('\n') + '\n';
}
