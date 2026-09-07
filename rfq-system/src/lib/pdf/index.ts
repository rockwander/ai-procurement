import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { RFQPDFDocument, type RFQPDFProps } from './rfq-pdf';
import { POPDFDocument, type POPDFData } from './po-pdf';

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

export type { RFQPDFProps, POPDFData };
