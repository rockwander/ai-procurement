import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { type RFQDocument, PER_LINE_RESPONSE_ITEMS } from '@/lib/rfq-document';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.4 },
  header: { marginBottom: 16, borderBottom: '2 solid #2563eb', paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2563eb', marginBottom: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  meta: { width: '50%', marginBottom: 2 },
  metaLabel: { fontWeight: 'bold' },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#1f2937',
  },
  row: { flexDirection: 'row', borderBottom: '1 solid #e5e7eb', paddingVertical: 4 },
  headerRow: { backgroundColor: '#f3f4f6', fontWeight: 'bold' },
  cLine: { width: '8%' },
  cItem: { width: '32%' },
  cSpec: { width: '35%' },
  cQty: { width: '13%' },
  cUnit: { width: '12%' },
  bullet: { marginBottom: 2 },
  qRow: { flexDirection: 'row', borderBottom: '1 solid #e5e7eb', paddingVertical: 4 },
  qCol: { width: '75%' },
  qResp: { width: '25%', color: '#6b7280' },
  note: { marginTop: 6, fontStyle: 'italic', color: '#374151' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
    borderTop: '1 solid #e5e7eb',
    paddingTop: 8,
  },
});

const RESP_LABEL: Record<string, string> = {
  yesno: 'Yes / No',
  text: 'Free text',
  file: 'Upload',
};

export interface RFQPDFProps {
  doc: RFQDocument;
  issueDate: string;
}

export const RFQPDFDocument: React.FC<{ data: RFQPDFProps }> = ({ data }) => {
  const { doc, issueDate } = data;
  const h = doc.header;
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>Request for Quotation</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Buyer: </Text>
              {h.buyer || '—'}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>RFQ ID: </Text>
              {h.rfqId}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Quote deadline: </Text>
              {h.quoteDeadline || '—'}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Expected delivery: </Text>
              {h.expectedDelivery || '—'}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Currency: </Text>
              {h.currency || '—'}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Validity: </Text>
              {h.validity || '—'}
            </Text>
            <Text style={styles.meta}>
              <Text style={styles.metaLabel}>Issued: </Text>
              {issueDate}
            </Text>
          </View>
        </View>

        {/* 1. Line items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Line items</Text>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={styles.cLine}>Line</Text>
            <Text style={styles.cItem}>Item</Text>
            <Text style={styles.cSpec}>Specification</Text>
            <Text style={styles.cQty}>Qty</Text>
            <Text style={styles.cUnit}>Unit</Text>
          </View>
          {doc.lineItems.map((li) => (
            <View key={li.id} style={styles.row} wrap={false}>
              <Text style={styles.cLine}>{li.line}</Text>
              <Text style={styles.cItem}>{li.item}</Text>
              <Text style={styles.cSpec}>{li.specification}</Text>
              <Text style={styles.cQty}>{li.quantity.toLocaleString()}</Text>
              <Text style={styles.cUnit}>{li.unit}</Text>
            </View>
          ))}
          {doc.lineItems.length === 0 && (
            <Text style={styles.bullet}>No line items specified.</Text>
          )}
        </View>

        {/* 2. Commercial information requested */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Commercial information requested</Text>
          <Text style={styles.bullet}>For each line item, the vendor provides:</Text>
          {PER_LINE_RESPONSE_ITEMS.map((item, i) => (
            <Text key={`pl-${i}`} style={styles.bullet}>
              • {item}
            </Text>
          ))}
          {doc.commercialFields.length > 0 && (
            <>
              <Text style={[styles.bullet, { marginTop: 6 }]}>
                Once for the whole quote:
              </Text>
              {doc.commercialFields.map((cf) => (
                <Text key={cf.id} style={styles.bullet}>
                  • {cf.label}
                  {cf.required ? ' (required)' : ''}
                </Text>
              ))}
            </>
          )}
        </View>

        {/* 3. Quality questionnaire */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Quality questionnaire</Text>
          {doc.questionnaire.length > 0 && (
            <View style={[styles.qRow, styles.headerRow]}>
              <Text style={styles.qCol}>Question</Text>
              <Text style={styles.qResp}>Vendor response</Text>
            </View>
          )}
          {doc.questionnaire.map((q) => (
            <View key={q.id} style={styles.qRow} wrap={false}>
              <Text style={styles.qCol}>
                {q.question}
                {q.required ? ' *' : ''}
              </Text>
              <Text style={styles.qResp}>{RESP_LABEL[q.responseType] ?? ''}</Text>
            </View>
          ))}
          {doc.questionnaire.length === 0 && (
            <Text style={styles.bullet}>No questionnaire questions.</Text>
          )}
          <Text style={styles.note}>
            Supporting documents: {doc.supportingDocsNote}
          </Text>
        </View>

        {/* 4. Terms & conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Terms &amp; conditions</Text>
          {doc.termsAndConditions.map((t, i) => (
            <Text key={i} style={styles.bullet}>
              • {t}
            </Text>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          This is an official Request for Quotation. Please submit your quote through the provided form link.
        </Text>
      </Page>
    </Document>
  );
};
