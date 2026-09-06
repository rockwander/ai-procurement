import { renderToBuffer } from '@react-pdf/renderer';
import { RFQPDFDocument, type RFQPDFData } from './rfq-pdf';
import { POPDFDocument, type POPDFData } from './po-pdf';

// Generate RFQ PDF as Buffer
export async function generateRFQPDF(data: RFQPDFData): Promise<Buffer> {
  const buffer = await renderToBuffer(<RFQPDFDocument data={data} />);
  return buffer;
}

// Generate PO PDF as Buffer
export async function generatePOPDF(data: POPDFData): Promise<Buffer> {
  const buffer = await renderToBuffer(<POPDFDocument data={data} />);
  return buffer;
}

export type { RFQPDFData, POPDFData };
