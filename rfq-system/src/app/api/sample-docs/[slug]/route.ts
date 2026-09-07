import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import {
  getSampleRFQ,
  getSampleRequisition,
  getSamplePolicy,
} from '@/lib/sample-docs';
import {
  getSupplierDoc,
  getSupplierSubmission,
} from '@/lib/sample-supplier-docs';
import { supplierQuoteCsv, supplierFaqCsv } from '@/lib/sample-supplier-csv';
import {
  generateSampleRFQPDF,
  generateSampleRequisitionPDF,
  generateSamplePolicyPDF,
  generateSupplierQuotePDF,
  generateSupplierFaqPDF,
} from '@/lib/pdf';

export const runtime = 'nodejs';

// Render a sample document (buyer-side or supplier-side) for download.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { slug } = await params;
    const download = request.nextUrl.searchParams.get('download') === '1';

    // --- buyer-side documents (all PDF) ---
    const rfq = getSampleRFQ(slug);
    const req = getSampleRequisition(slug);
    const pol = getSamplePolicy(slug);

    if (rfq) return pdf(await generateSampleRFQPDF(rfq), rfq.fileName, download);
    if (req) return pdf(await generateSampleRequisitionPDF(req), req.meta.fileName, download);
    if (pol) return pdf(await generateSamplePolicyPDF(pol), pol.meta.fileName, download);

    // --- supplier-side documents (PDF or CSV) ---
    const doc = getSupplierDoc(slug);
    if (doc) {
      const sub = getSupplierSubmission(doc.supplierSlug)!;
      if (doc.format === 'csv') {
        const body = doc.kind === 'quote' ? supplierQuoteCsv(sub) : supplierFaqCsv(sub);
        return new Response(body, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${doc.fileName}"`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      const buf =
        doc.kind === 'quote'
          ? await generateSupplierQuotePDF(sub)
          : await generateSupplierFaqPDF(sub);
      return pdf(buf, doc.fileName, download);
    }

    return notFound('Sample document not found');
  } catch (error) {
    return serverError(error);
  }
}

function pdf(buffer: Buffer, fileName: string, download: boolean): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
