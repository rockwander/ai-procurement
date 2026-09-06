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
    borderBottom: '2 solid #10b981',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
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
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#d1fae5',
    paddingVertical: 10,
    paddingHorizontal: 5,
    marginTop: 10,
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

export interface POPDFData {
  poNumber: string;
  rfqTitle: string;
  supplier: {
    name: string;
    email: string;
    phone?: string;
  };
  issueDate: string;
  lineItems: Array<{
    itemDescription: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  currency: string;
  terms?: string;
  notes?: string;
}

export const POPDFDocument: React.FC<{ data: POPDFData }> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Purchase Order</Text>
        <Text style={styles.subtitle}>PO #{data.poNumber}</Text>
      </View>

      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Details</Text>
        <Text style={styles.text}>RFQ Reference: {data.rfqTitle}</Text>
        <Text style={styles.text}>Issue Date: {data.issueDate}</Text>
      </View>

      {/* Supplier Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Supplier</Text>
        <Text style={styles.text}>{data.supplier.name}</Text>
        <Text style={styles.text}>Email: {data.supplier.email}</Text>
        {data.supplier.phone && (
          <Text style={styles.text}>Phone: {data.supplier.phone}</Text>
        )}
      </View>

      {/* Line Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items Ordered</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { flex: 3 }]}>Description</Text>
            <Text style={styles.tableCell}>Qty</Text>
            <Text style={styles.tableCell}>Unit Price</Text>
            <Text style={styles.tableCell}>Total</Text>
          </View>
          {data.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{item.itemDescription}</Text>
              <Text style={styles.tableCell}>{item.quantity}</Text>
              <Text style={styles.tableCell}>${item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.tableCell}>${item.totalPrice.toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.totalRow}>
          <Text style={{ flex: 5, textAlign: 'right', fontWeight: 'bold' }}>
            Total Amount:
          </Text>
          <Text style={{ flex: 1, fontWeight: 'bold' }}>
            ${data.totalAmount.toFixed(2)} {data.currency}
          </Text>
        </View>
      </View>

      {/* Terms */}
      {data.terms && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms and Conditions</Text>
          <Text style={styles.text}>{data.terms}</Text>
        </View>
      )}

      {/* Notes */}
      {data.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.text}>{data.notes}</Text>
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        This is an official Purchase Order. Please confirm acceptance within 48 hours.
      </Text>
    </Page>
  </Document>
);
