import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import {
  getSampleRFQ,
  getSampleRequisition,
  getSamplePolicy,
} from '@/lib/sample-docs';
import {
  generateSampleRFQPDF,
  generateSampleRequisitionPDF,
  generateSamplePolicyPDF,
} from '@/lib/pdf';

export const runtime = 'nodejs';

// Render a sample document as a PDF for download.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { slug } = await params;

    let buffer: Buffer | null = null;
    let fileName = 'sample.pdf';

    const rfq = getSampleRFQ(slug);
    const req = getSampleRequisition(slug);
    const pol = getSamplePolicy(slug);

    if (rfq) {
      buffer = await generateSampleRFQPDF(rfq);
      fileName = rfq.fileName;
    } else if (req) {
      buffer = await generateSampleRequisitionPDF(req);
      fileName = req.meta.fileName;
    } else if (pol) {
      buffer = await generateSamplePolicyPDF(pol);
      fileName = pol.meta.fileName;
    }

    if (!buffer) return notFound('Sample document not found');

    const disposition =
      request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${fileName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
