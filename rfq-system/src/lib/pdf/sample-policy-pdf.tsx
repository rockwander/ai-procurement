import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { SamplePolicy } from '@/lib/sample-docs';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, fontSize: 8, fontFamily: 'Helvetica', color: '#111', lineHeight: 1.42 },
  band: { borderBottom: '2 solid #1f2937', paddingBottom: 6, marginBottom: 10 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1f2937', lineHeight: 1, marginBottom: 4 },
  sub: { fontSize: 8, color: '#4b5563' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  metaCell: { width: '50%', marginBottom: 1.5 },
  k: { fontFamily: 'Helvetica-Bold' },
  secTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#1f2937', marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 4, textAlign: 'justify' },
  clauseRef: { fontFamily: 'Helvetica-Bold' },
  clause: { marginBottom: 5 },
  tHead: { flexDirection: 'row', backgroundColor: '#1f2937', color: '#fff', fontFamily: 'Helvetica-Bold', paddingVertical: 3 },
  tRow: { flexDirection: 'row', borderBottom: '0.5 solid #d1d5db', paddingVertical: 2.6 },
  tRowAlt: { backgroundColor: '#f3f4f6' },
  cBand: { width: '26%', paddingHorizontal: 3 },
  cAppr: { width: '40%', paddingHorizontal: 3 },
  cComp: { width: '34%', paddingHorizontal: 3 },
  twoCol: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  li: { marginBottom: 1.6, paddingLeft: 8 },
  callout: { backgroundColor: '#eef2ff', border: '0.5 solid #c7d2fe', padding: 6, marginTop: 4, marginBottom: 4 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTop: '0.5 solid #d1d5db', paddingTop: 5, fontSize: 6.5, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
});

export const SamplePolicyDocument: React.FC<{ data: SamplePolicy }> = ({ data }) => (
  <Document title={`${data.policyNo} ${data.version} — Indirect Procurement Policy`} author={data.owner}>
    <Page size="A4" style={s.page} wrap>
      <View style={s.band}>
        <Text style={s.h1}>Procurement Policy — Indirect Goods &amp; Services</Text>
        <Text style={s.sub}>{data.appliesTo}</Text>
        <View style={s.metaGrid}>
          <Text style={s.metaCell}><Text style={s.k}>Policy no.: </Text>{data.policyNo}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Version: </Text>{data.version}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Effective: </Text>{data.effectiveDate}</Text>
          <Text style={s.metaCell}><Text style={s.k}>Owner: </Text>{data.owner}</Text>
        </View>
      </View>

      <Text style={s.secTitle}>Purpose</Text>
      <Text style={s.p}>{data.purpose}</Text>

      <Text style={s.secTitle}>Approval matrix (by committed value)</Text>
      <View style={s.tHead}>
        <Text style={s.cBand}>Spend band</Text>
        <Text style={s.cAppr}>Approver</Text>
        <Text style={s.cComp}>Minimum competition</Text>
      </View>
      {data.approvalMatrix.map((m, i) => (
        <View key={i} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]} wrap={false}>
          <Text style={s.cBand}>{m.band}</Text>
          <Text style={s.cAppr}>{m.approver}</Text>
          <Text style={s.cComp}>{m.competition}</Text>
        </View>
      ))}

      <Text style={s.secTitle}>Clauses</Text>
      {data.clauses.map((c) => (
        <View key={c.ref} style={s.clause} wrap={false}>
          <Text>
            <Text style={s.clauseRef}>{c.ref}  {c.heading}. </Text>
            {c.body}
          </Text>
        </View>
      ))}

      <Text style={s.secTitle}>§7 — Category requirements: what the RFQ must ask</Text>
      {data.categoryRules.map((r) => (
        <View key={r.category} wrap={false}>
          <View style={s.callout}>
            <Text style={s.k}>{r.category}</Text>
          </View>
          <View style={s.twoCol}>
            <View style={s.col}>
              <Text style={s.k}>Commercial fields (mandatory, per line item)</Text>
              {r.mandatoryCommercialFields.map((f, i) => (
                <Text key={i} style={s.li}>•  {f}</Text>
              ))}
            </View>
            <View style={s.col}>
              <Text style={s.k}>Quality questions (mandatory)</Text>
              {r.mandatoryQuestions.map((q, i) => (
                <Text key={i} style={s.li}>{i + 1}.  {q}</Text>
              ))}
            </View>
          </View>
          <Text style={[s.k, { marginTop: 4 }]}>Supporting documents to request</Text>
          {r.mandatoryDocuments.map((d, i) => (
            <Text key={i} style={s.li}>•  {d}</Text>
          ))}
        </View>
      ))}

      <View style={s.footer} fixed>
        <Text>{data.policyNo} {data.version} · {data.owner} · Controlled document</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);
