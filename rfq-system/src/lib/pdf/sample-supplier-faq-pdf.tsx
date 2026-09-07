import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { SupplierSubmission, answeredCount } from '@/lib/sample-supplier-docs';

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 42, paddingHorizontal: 40, fontSize: 8.5, fontFamily: 'Helvetica', color: '#111', lineHeight: 1.45 },
  band: { borderBottom: '2 solid #1f2937', paddingBottom: 6, marginBottom: 10 },
  h1: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1f2937', lineHeight: 1, marginBottom: 4 },
  sub: { fontSize: 8, color: '#4b5563' },
  meta: { marginTop: 5, fontSize: 8, color: '#374151' },
  qBlock: { marginBottom: 8 },
  q: { fontFamily: 'Helvetica-Bold' },
  a: { marginTop: 1.5 },
  dim: { color: '#9ca3af', fontStyle: 'italic' },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, borderTop: '0.5 solid #d1d5db', paddingTop: 5, fontSize: 6.5, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
});

export const SupplierFaqDocument: React.FC<{ data: SupplierSubmission }> = ({ data }) => (
  <Document title={`${data.supplierName} — Questionnaire answers`} author={data.supplierName}>
    <Page size="A4" style={s.page} wrap>
      <View style={s.band}>
        <Text style={s.h1}>Quality Questionnaire — Supplier Response</Text>
        <Text style={s.sub}>{data.supplierName} · in response to RFQ-2026-001 (Corrugated Packaging)</Text>
        <Text style={s.meta}>
          Quote ref {data.quoteRef} · {data.quoteDate} · {answeredCount(data)} of {data.faq.length} questions answered
        </Text>
      </View>

      {data.faq.map((item, i) => (
        <View key={i} style={s.qBlock} wrap={false}>
          <Text style={s.q}>{i + 1}. {item.question}</Text>
          {item.answer.trim() ? (
            <Text style={s.a}>{item.answer}</Text>
          ) : (
            <Text style={[s.a, s.dim]}>[no response provided]</Text>
          )}
        </View>
      ))}

      <View style={s.footer} fixed>
        <Text>{data.supplierName} · Questionnaire response to RFQ-2026-001</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);
