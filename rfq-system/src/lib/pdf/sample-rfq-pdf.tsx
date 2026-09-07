import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { SampleRFQ } from '@/lib/sample-rfqs';

// A realistic buyer-issued RFQ, tuned to fit 30 line items in ~2 pages.
const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 34, fontSize: 7.4, fontFamily: 'Helvetica', color: '#111', lineHeight: 1.35 },
  band: { borderBottom: '2 solid #1f2937', paddingBottom: 6, marginBottom: 8 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1f2937', lineHeight: 1, marginBottom: 5 },
  sub: { fontSize: 8, color: '#4b5563' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  metaCell: { width: '50%', marginBottom: 1.5 },
  k: { fontFamily: 'Helvetica-Bold' },
  secTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 3, textAlign: 'justify' },
  li: { marginBottom: 1.5, paddingLeft: 8 },
  // table
  tHead: { flexDirection: 'row', backgroundColor: '#1f2937', color: '#fff', fontFamily: 'Helvetica-Bold', paddingVertical: 3 },
  tRow: { flexDirection: 'row', borderBottom: '0.5 solid #d1d5db', paddingVertical: 2.4 },
  tRowAlt: { backgroundColor: '#f3f4f6' },
  cNo: { width: '5%', paddingHorizontal: 3 },
  cItem: { width: '26%', paddingHorizontal: 3 },
  cSpec: { width: '49%', paddingHorizontal: 3 },
  cQty: { width: '12%', paddingHorizontal: 3, textAlign: 'right' },
  cUnit: { width: '8%', paddingHorizontal: 3 },
  twoCol: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  footer: { position: 'absolute', bottom: 20, left: 34, right: 34, borderTop: '0.5 solid #d1d5db', paddingTop: 5, fontSize: 6.5, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
});

export const SampleRFQDocument: React.FC<{ data: SampleRFQ }> = ({ data }) => (
  <Document
    title={`${data.rfqId} — ${data.title}`}
    author={data.buyer.name}
    subject="Request for Quotation"
  >
    <Page size="A4" style={s.page} wrap>
      {/* Header */}
      <View style={s.band}>
        <Text style={s.h1}>Request for Quotation</Text>
        <Text style={s.sub}>
          {data.buyer.name} · {data.buyer.address}
        </Text>
        <View style={s.metaGrid}>
          <Text style={s.metaCell}><Text style={s.k}>RFQ ID: </Text>{data.rfqId}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Issue date: </Text>{data.issueDate}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Quote deadline: </Text>{data.quoteDeadline}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Currency: </Text>{data.currency}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Expected delivery: </Text>{data.expectedDelivery}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Validity: </Text>{data.validity}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Incoterms: </Text>{data.incoterms}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Payment terms: </Text>{data.paymentTerms}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Buyer contact: </Text>{data.buyer.contactName}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Email / phone: </Text>{data.buyer.contactEmail} · {data.buyer.contactPhone}</Text>
        </View>
      </View>

      {/* Scope */}
      <Text style={s.secTitle}>1. Scope &amp; instructions</Text>
      <Text style={s.p}>{data.scope}</Text>
      <Text style={s.p}>
        Quotations must be submitted through the supplier portal link provided in the
        invitation email by the deadline above. Late or incomplete quotations may be
        rejected. Prices to be quoted per unit in {data.currency}, exclusive of taxes
        unless stated. This RFQ does not oblige the buyer to award any contract.
      </Text>

      {/* Line items */}
      <Text style={s.secTitle}>2. Line items ({data.lineItems.length})</Text>
      <View style={s.tHead}>
        <Text style={s.cNo}>#</Text>
        <Text style={s.cItem}>Item</Text>
        <Text style={s.cSpec}>Specification</Text>
        <Text style={s.cQty}>Est. annual qty</Text>
        <Text style={s.cUnit}>Unit</Text>
      </View>
      {data.lineItems.map((li, i) => (
        <View key={li.line} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
          <Text style={s.cNo}>{li.line}</Text>
          <Text style={s.cItem}>{li.item}</Text>
          <Text style={s.cSpec}>{li.specification}</Text>
          <Text style={s.cQty}>{li.qty.toLocaleString('en-IN')}</Text>
          <Text style={s.cUnit}>{li.unit}</Text>
        </View>
      ))}

      {/* Commercial + questionnaire side by side */}
      <View style={s.twoCol} wrap={false}>
        <View style={s.col}>
          <Text style={s.secTitle}>3. Commercial information requested</Text>
          <Text style={s.p}>For each line item above, the vendor must provide:</Text>
          {data.commercialFields.map((f, i) => (
            <Text key={i} style={s.li}>•  {f}</Text>
          ))}
        </View>
        <View style={s.col}>
          <Text style={s.secTitle}>4. Quality questionnaire</Text>
          {data.questionnaire.map((q, i) => (
            <Text key={i} style={s.li}>{i + 1}.  {q}</Text>
          ))}
          <Text style={[s.p, { marginTop: 4, fontFamily: 'Helvetica-Bold' }]}>
            Supporting documents: upload certificates and relevant documents with your quote.
          </Text>
        </View>
      </View>

      {/* Terms */}
      <Text style={s.secTitle} wrap={false}>5. Terms &amp; conditions</Text>
      {data.terms.map((t, i) => (
        <Text key={i} style={s.li}>{i + 1}.  {t}</Text>
      ))}

      <View style={s.footer} fixed>
        <Text>{data.rfqId} · {data.buyer.name} · Confidential</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);
