import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, purchaseOrders, suppliers } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { generatePOPDF } from '@/lib/pdf';
import { sendPOEmail } from '@/lib/email';

interface AwardInput {
  supplierId: string;
  supplierName: string;
  lineItems: Array<{
    itemId: string;
    itemDescription: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
}

/**
 * Confirm an award split: create one purchase_order per awarded supplier,
 * render its PO PDF, and email it. Marks the RFQ awarded.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const body = await request.json();
    const { awards, strategy, reasoning } = body as {
      awards?: AwardInput[];
      strategy?: string;
      reasoning?: string;
    };

    if (!awards || awards.length === 0) return badRequest('awards is required');
    if (!strategy) return badRequest('strategy is required');

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');
    if (rfq.status === 'awarded') {
      return badRequest('This RFQ has already been awarded');
    }

    const supplierRows = await db
      .select()
      .from(suppliers)
      .where(inArray(suppliers.id, awards.map((a) => a.supplierId)));
    const supplierById = new Map(supplierRows.map((s) => [s.id, s]));

    const now = Date.now();
    const results: Array<{ poNumber: string; supplier: string; emailSent: boolean; error?: string }> = [];

    for (let i = 0; i < awards.length; i++) {
      const award = awards[i];
      const supplier = supplierById.get(award.supplierId);
      if (!supplier) {
        results.push({ poNumber: '-', supplier: award.supplierName, emailSent: false, error: 'Supplier not found' });
        continue;
      }

      const poNumber = `PO-${rfq.id.slice(0, 6).toUpperCase()}-${String(now).slice(-6)}-${i + 1}`;

      const [po] = await db
        .insert(purchaseOrders)
        .values({
          rfqId: id,
          poNumber,
          awards: [award],
          strategyUsed: strategy,
          strategyReasoning: reasoning ?? null,
          status: 'sent',
          totalValue: award.totalAmount,
          currency: 'USD',
          createdBy: user.userId,
        })
        .returning();

      const pdfBuffer = await generatePOPDF({
        poNumber,
        rfqTitle: rfq.title,
        supplier: {
          name: supplier.companyName,
          email: supplier.contactEmail,
          phone: supplier.contactPhone ?? undefined,
        },
        issueDate: new Date().toLocaleDateString(),
        lineItems: award.lineItems.map((li) => ({
          itemDescription: li.itemDescription,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          totalPrice: li.totalPrice,
        })),
        totalAmount: award.totalAmount,
        currency: 'USD',
      });

      const emailResult = await sendPOEmail(
        {
          to: supplier.contactEmail,
          supplierName: supplier.companyName,
          poNumber,
          totalAmount: award.totalAmount,
          pdfAttachment: { filename: `${poNumber}.pdf`, content: pdfBuffer },
        },
        po.id
      );

      results.push({
        poNumber,
        supplier: supplier.companyName,
        emailSent: emailResult.success,
        error: emailResult.success ? undefined : emailResult.error,
      });
    }

    await db
      .update(rfqs)
      .set({ status: 'awarded', updatedAt: new Date() })
      .where(eq(rfqs.id, id));

    return NextResponse.json({ results });
  } catch (error) {
    return serverError(error);
  }
}
