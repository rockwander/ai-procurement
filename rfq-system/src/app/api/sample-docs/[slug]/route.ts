import { NextRequest } from 'next/server';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import { getSampleRFQ } from '@/lib/sample-rfqs';
import { generateSampleRFQPDF } from '@/lib/pdf';

export const runtime = 'nodejs';

// Render a sample RFQ as a PDF for download.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const { slug } = await params;
    const sample = getSampleRFQ(slug);
    if (!sample) return notFound('Sample document not found');

    const buffer = await generateSampleRFQPDF(sample);
    const disposition =
      request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${sample.fileName}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
