import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { RFQPDFDocument, type RFQPDFProps } from './rfq-pdf';
import { POPDFDocument, type POPDFData } from './po-pdf';
import { SampleRFQDocument } from './sample-rfq-pdf';
import { SampleRequisitionDocument } from './sample-requisition-pdf';
import { SamplePolicyDocument } from './sample-policy-pdf';
import { SupplierQuoteDocument } from './sample-supplier-quote-pdf';
import { SupplierFaqDocument } from './sample-supplier-faq-pdf';
import type { SampleRFQ } from '@/lib/sample-rfqs';
import type { SampleRequisition, SamplePolicy } from '@/lib/sample-docs';
import type { SupplierSubmission } from '@/lib/sample-supplier-docs';

// Generate RFQ PDF as Buffer from the structured RFQ document.
export async function generateRFQPDF(data: RFQPDFProps): Promise<Buffer> {
  const element = createElement(RFQPDFDocument, { data } as any);
  const buffer = await renderToBuffer(element as any);
  return buffer;
}

// Generate PO PDF as Buffer  
export async function generatePOPDF(data: POPDFData): Promise<Buffer> {
  const element = createElement(POPDFDocument, { data } as any);
  const buffer = await renderToBuffer(element as any);
  return buffer;
}

// Sample documents for the "Sample docs" page.
export async function generateSampleRFQPDF(data: SampleRFQ): Promise<Buffer> {
  return renderToBuffer(createElement(SampleRFQDocument, { data } as any) as any);
}

export async function generateSampleRequisitionPDF(data: SampleRequisition): Promise<Buffer> {
  return renderToBuffer(createElement(SampleRequisitionDocument, { data } as any) as any);
}

export async function generateSamplePolicyPDF(data: SamplePolicy): Promise<Buffer> {
  return renderToBuffer(createElement(SamplePolicyDocument, { data } as any) as any);
}

export async function generateSupplierQuotePDF(data: SupplierSubmission): Promise<Buffer> {
  return renderToBuffer(createElement(SupplierQuoteDocument, { data } as any) as any);
}

export async function generateSupplierFaqPDF(data: SupplierSubmission): Promise<Buffer> {
  return renderToBuffer(createElement(SupplierFaqDocument, { data } as any) as any);
}

export type { RFQPDFProps, POPDFData };
