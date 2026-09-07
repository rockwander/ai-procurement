import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { SupplierSubmission, quoteTotals } from '@/lib/sample-supplier-docs';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 42, paddingHorizontal: 40, fontSize: 8, fontFamily: 'Helvetica', color: '#111', lineHeight: 1.4 },
  band: { borderBottom: '2 solid #1f2937', paddingBottom: 6, marginBottom: 10 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1f2937', lineHeight: 1, marginBottom: 4 },
  sub: { fontSize: 8, color: '#4b5563' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  metaCell: { width: '50%', marginBottom: 1.5 },
  k: { fontFamily: 'Helvetica-Bold' },
  secTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginTop: 11, marginBottom: 4 },
  p: { marginBottom: 3, textAlign: 'justify' },
  tHead: { flexDirection: 'row', backgroundColor: '#1f2937', color: '#fff', fontFamily: 'Helvetica-Bold', paddingVertical: 3 },
  tRow: { flexDirection: 'row', borderBottom: '0.5 solid #d1d5db', paddingVertical: 2.6 },
  tRowAlt: { backgroundColor: '#f3f4f6' },
  cNo: { width: '5%', paddingHorizontal: 3 },
  cItem: { width: '37%', paddingHorizontal: 3 },
  cQty: { width: '12%', paddingHorizontal: 3, textAlign: 'right' },
  cPrice: { width: '14%', paddingHorizontal: 3, textAlign: 'right' },
  cMoq: { width: '10%', paddingHorizontal: 3, textAlign: 'right' },
  cLead: { width: '10%', paddingHorizontal: 3, textAlign: 'right' },
  cTot: { width: '12%', paddingHorizontal: 3, textAlign: 'right' },
  dim: { color: '#9ca3af' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 5, fontFamily: 'Helvetica-Bold' },
  commRow: { flexDirection: 'row', marginBottom: 1.5 },
  commK: { width: '32%', fontFamily: 'Helvetica-Bold' },
  commV: { width: '68%' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTop: '0.5 solid #d1d5db', paddingTop: 5, fontSize: 6.5, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
});

const money = (n: number) => 'INR ' + Math.round(n).toLocaleString('en-IN');

export const SupplierQuoteDocument: React.FC<{ data: SupplierSubmission }> = ({ data }) => {
  const t = quoteTotals(data);
  return (
    <Document title={`${data.quoteRef} — ${data.supplierName}`} author={data.supplierName}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.band}>
          <Text style={s.h1}>{data.supplierName}</Text>
          <Text style={s.sub}>{data.address}</Text>
          <View style={s.metaGrid}>
            <Text style={s.metaCell}><Text style={s.k}>Quotation ref: </Text>{data.quoteRef}</Text>
            <Text style={s.metaCell}><Text style={s.k}>Date: </Text>{data.quoteDate}</Text>
            <Text style={s.metaCell}><Text style={s.k}>Against RFQ: </Text>RFQ-2026-001 (Corrugated Packaging)</Text>
            <Text style={s.metaCell}><Text style={s.k}>Buyer: </Text>ABC Manufacturing Pvt. Ltd.</Text>
            <Text style={s.metaCell}><Text style={s.k}>Contact: </Text>{data.contact.person}</Text>
            <Text style={s.metaCell}><Text style={s.k}>Email / phone: </Text>{data.contact.email} · {data.contact.phone}</Text>
            <Text style={s.metaCell}><Text style={s.k}>GSTIN: </Text>{data.contact.gstin || <Text style={s.dim}>not stated</Text>}</Text>
            <Text style={s.metaCell}><Text style={s.k}>Currency: </Text>{data.currency}</Text>
          </View>
        </View>

        <Text style={s.secTitle}>Line item pricing</Text>
        <View style={s.tHead}>
          <Text style={s.cNo}>#</Text>
          <Text style={s.cItem}>Item</Text>
          <Text style={s.cQty}>Ask qty</Text>
          <Text style={s.cPrice}>Unit price</Text>
          <Text style={s.cMoq}>MOQ</Text>
          <Text style={s.cLead}>Lead (d)</Text>
          <Text style={s.cTot}>Line total</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={l.line} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
            <Text style={s.cNo}>{l.line}</Text>
            <Text style={s.cItem}>{l.item}</Text>
            <Text style={s.cQty}>{l.askQty.toLocaleString('en-IN')} {l.unit}</Text>
            <Text style={[s.cPrice, ...(l.unitPrice == null ? [s.dim] : [])]}>
              {l.unitPrice == null ? 'not quoted' : money(l.unitPrice)}
            </Text>
            <Text style={[s.cMoq, ...(l.moq == null ? [s.dim] : [])]}>
              {l.moq == null ? '-' : l.moq.toLocaleString('en-IN')}
            </Text>
            <Text style={[s.cLead, ...(l.leadTimeDays == null ? [s.dim] : [])]}>
              {l.leadTimeDays == null ? '-' : l.leadTimeDays}
            </Text>
            <Text style={[s.cTot, ...(l.unitPrice == null ? [s.dim] : [])]}>
              {l.unitPrice == null ? '-' : money(l.unitPrice * l.askQty)}
            </Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text>
            {t.pricedLines} of {t.totalLines} lines priced · estimated quoted value {money(t.estimatedValue)} (ex-GST)
          </Text>
        </View>

        <Text style={s.secTitle}>Commercial terms</Text>
        {(
          [
            ['Payment terms', data.paymentTerms],
            ['Incoterms', data.incoterms],
            ['Quote validity', data.validityDays != null ? `${data.validityDays} days` : ''],
            ['GST %', data.commercial.gstPercent],
            ['Freight', data.commercial.freight],
            ['Tooling / die charges', data.commercial.toolingCharges],
            ['Volume discount', data.commercial.volumeDiscount],
            ['Price validity', data.commercial.priceValidity],
          ] as Array<[string, string]>
        ).map(([k, v]) => (
          <View key={k} style={s.commRow}>
            <Text style={s.commK}>{k}</Text>
            <Text style={[s.commV, ...(v ? [] : [s.dim])]}>{v || 'not stated'}</Text>
          </View>
        ))}

        <Text style={s.secTitle}>Notes</Text>
        <Text style={s.p}>{data.notes}</Text>

        <View style={s.footer} fixed>
          <Text>{data.quoteRef} · {data.supplierName} · Quotation against RFQ-2026-001</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};
