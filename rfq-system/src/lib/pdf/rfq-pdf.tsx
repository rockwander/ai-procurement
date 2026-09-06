import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #2563eb',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginTop: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1f2937',
  },
  text: {
    marginBottom: 5,
    lineHeight: 1.5,
  },
  table: {
    marginTop: 10,
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 8,
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 9,
    color: '#666',
    borderTop: '1 solid #e5e7eb',
    paddingTop: 10,
  },
});

export interface RFQPDFData {
  rfqNumber: string;
  title: string;
  description: string;
  createdDate: string;
  deadline?: string;
  lineItems: Array<{
    itemDescription: string;
    quantity: number;
    unit: string;
    specifications?: Record<string, any>;
  }>;
  requirements?: string[];
  termsAndConditions?: string[];
  evaluationCriteria?: string[];
}

export const RFQPDFDocument: React.FC<{ data: RFQPDFData }> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Request for Quotation</Text>
        <Text style={styles.subtitle}>RFQ #{data.rfqNumber}</Text>
      </View>

      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{data.title}</Text>
        <Text style={styles.text}>{data.description}</Text>
        <Text style={styles.text}>Issue Date: {data.createdDate}</Text>
        {data.deadline && (
          <Text style={styles.text}>Submission Deadline: {data.deadline}</Text>
        )}
      </View>

      {/* Line Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Line Items</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { flex: 3 }]}>Description</Text>
            <Text style={styles.tableCell}>Quantity</Text>
            <Text style={styles.tableCell}>Unit</Text>
          </View>
          {data.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{item.itemDescription}</Text>
              <Text style={styles.tableCell}>{item.quantity}</Text>
              <Text style={styles.tableCell}>{item.unit}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Requirements */}
      {data.requirements && data.requirements.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements</Text>
          {data.requirements.map((req, index) => (
            <Text key={index} style={styles.text}>
              • {req}
            </Text>
          ))}
        </View>
      )}

      {/* Evaluation Criteria */}
      {data.evaluationCriteria && data.evaluationCriteria.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evaluation Criteria</Text>
          {data.evaluationCriteria.map((criteria, index) => (
            <Text key={index} style={styles.text}>
              • {criteria}
            </Text>
          ))}
        </View>
      )}

      {/* Terms and Conditions */}
      {data.termsAndConditions && data.termsAndConditions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms and Conditions</Text>
          {data.termsAndConditions.map((term, index) => (
            <Text key={index} style={styles.text}>
              {index + 1}. {term}
            </Text>
          ))}
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        This is an official Request for Quotation. Please submit your quote through the provided form link.
      </Text>
    </Page>
  </Document>
);
