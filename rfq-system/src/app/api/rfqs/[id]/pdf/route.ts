import { NextRequest } from 'next/server';
import { db } from '@/db';
import { rfqs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { generateRFQPDF } from '@/lib/pdf';
import { normalizeRFQDocument } from '@/lib/rfq-document';

export const runtime = 'nodejs';

// Render the RFQ PDF for preview/download.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');
    if (!rfq.rfqDocument) {
      return badRequest('This RFQ has no content yet. Run "update" in the chat first.');
    }

    const doc = normalizeRFQDocument(rfq.rfqDocument, {
      rfqId: rfq.id,
      buyer: user.name,
    });

    const buffer = await generateRFQPDF({
      doc,
      issueDate: new Date(rfq.createdAt).toLocaleDateString(),
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="RFQ-${rfq.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
