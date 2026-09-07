import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { SampleRequisition } from '@/lib/sample-docs';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, fontSize: 8, fontFamily: 'Helvetica', color: '#111', lineHeight: 1.4 },
  band: { borderBottom: '2 solid #1f2937', paddingBottom: 6, marginBottom: 10 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1f2937', lineHeight: 1, marginBottom: 4 },
  sub: { fontSize: 8, color: '#4b5563' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  metaCell: { width: '50%', marginBottom: 1.5 },
  k: { fontFamily: 'Helvetica-Bold' },
  secTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 4, textAlign: 'justify' },
  li: { marginBottom: 2, paddingLeft: 8 },
  tHead: { flexDirection: 'row', backgroundColor: '#1f2937', color: '#fff', fontFamily: 'Helvetica-Bold', paddingVertical: 3 },
  tRow: { flexDirection: 'row', borderBottom: '0.5 solid #d1d5db', paddingVertical: 2.6 },
  tRowAlt: { backgroundColor: '#f3f4f6' },
  cNo: { width: '5%', paddingHorizontal: 3 },
  cItem: { width: '40%', paddingHorizontal: 3 },
  cPurpose: { width: '31%', paddingHorizontal: 3 },
  cQty: { width: '12%', paddingHorizontal: 3, textAlign: 'right' },
  cCost: { width: '12%', paddingHorizontal: 3, textAlign: 'right' },
  apprCard: { borderLeft: '2 solid #1f2937', paddingLeft: 6, marginBottom: 5 },
  apprHead: { fontFamily: 'Helvetica-Bold' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTop: '0.5 solid #d1d5db', paddingTop: 5, fontSize: 6.5, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
});

const inr = (n: number) => 'INR ' + n.toLocaleString('en-IN');

export const SampleRequisitionDocument: React.FC<{ data: SampleRequisition }> = ({ data }) => (
  <Document title={`${data.reqNo} — Business-Approved Item Request`} author={data.raisedBy.department}>
    <Page size="A4" style={s.page} wrap>
      <View style={s.band}>
        <Text style={s.h1}>Business-Approved Item Request</Text>
        <Text style={s.sub}>Purchase requisition · to be actioned by Procurement</Text>
        <View style={s.metaGrid}>
          <Text style={s.metaCell}><Text style={s.k}>Requisition no.: </Text>{data.reqNo}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Cost centre: </Text>{data.costCentre}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Raised by: </Text>{data.raisedBy.name}, {data.raisedBy.title}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Department: </Text>{data.raisedBy.department}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Date raised: </Text>{data.raisedBy.date}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Needed by: </Text>{data.neededBy}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Budget line: </Text>{data.budgetLine}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Est. annual value: </Text>{inr(data.estimatedAnnualValue)} ({data.currency})</Text>
        </View>
      </View>

      <Text style={s.secTitle}>1. Business justification</Text>
      <Text style={s.p}>{data.businessJustification}</Text>

      <Text style={s.secTitle}>2. Items requested</Text>
      <View style={s.tHead}>
        <Text style={s.cNo}>#</Text>
        <Text style={s.cItem}>Item group</Text>
        <Text style={s.cPurpose}>Purpose / end use</Text>
        <Text style={s.cQty}>Est. annual qty</Text>
        <Text style={s.cCost}>Est. unit cost</Text>
      </View>
      {data.lines.map((l, i) => (
        <View key={l.line} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
          <Text style={s.cNo}>{l.line}</Text>
          <Text style={s.cItem}>{l.item}</Text>
          <Text style={s.cPurpose}>{l.purpose}</Text>
          <Text style={s.cQty}>{l.annualQty.toLocaleString('en-IN')} {l.unit}</Text>
          <Text style={s.cCost}>{inr(l.estUnitCost)}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text>Estimated annual value: {inr(data.estimatedAnnualValue)}  (indicative, ± 20%)</Text>
      </View>

      <Text style={s.secTitle}>3. Approvals</Text>
      {data.approvals.map((a, i) => (
        <View key={i} style={s.apprCard} wrap={false}>
          <Text style={s.apprHead}>{a.level}</Text>
          <Text>{a.name}, {a.title} — approved {a.date}</Text>
          <Text style={{ color: '#4b5563' }}>{a.note}</Text>
        </View>
      ))}

      <Text style={s.secTitle}>4. Notes to Procurement</Text>
      {data.notesToProcurement.map((n, i) => (
        <Text key={i} style={s.li}>•  {n}</Text>
      ))}

      <View style={s.footer} fixed>
        <Text>{data.reqNo} · {data.raisedBy.department} · Confidential — internal</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);
