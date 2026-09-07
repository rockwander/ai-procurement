import { NextRequest } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqLineItems } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, serverError } from '@/lib/api';
import { generateRFQPDF } from '@/lib/pdf';

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

    const lineItems = await db
      .select()
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, id))
      .orderBy(asc(rfqLineItems.orderIndex));

    let draft: any = null;
    try {
      draft = rfq.generatedContent ? JSON.parse(rfq.generatedContent) : null;
    } catch {}

    const buffer = await generateRFQPDF({
      rfqNumber: rfq.id.slice(0, 8).toUpperCase(),
      title: rfq.title,
      description: rfq.description,
      createdDate: new Date(rfq.createdAt).toLocaleDateString(),
      deadline: rfq.deadline ? new Date(rfq.deadline).toLocaleDateString() : undefined,
      lineItems: lineItems.map((li) => ({
        itemDescription: li.itemDescription,
        quantity: li.quantity,
        unit: li.unit,
      })),
      requirements: draft?.requirements,
      termsAndConditions: draft?.termsAndConditions,
      evaluationCriteria: draft?.evaluationCriteria,
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
