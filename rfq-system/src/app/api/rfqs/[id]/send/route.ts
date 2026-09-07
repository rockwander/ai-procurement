import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, suppliers, rfqInvitations } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { generateRFQPDF } from '@/lib/pdf';
import { sendRFQEmail } from '@/lib/email';
import { normalizeRFQDocument, rfqDocumentToText } from '@/lib/rfq-document';

export const runtime = 'nodejs';

/**
 * Send an RFQ to a selected set of suppliers.
 * Creates one rfq_invitation per supplier (each with a unique token), renders
 * the RFQ PDF once, and emails every supplier the summary + PDF + form link.
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
    const { supplierIds } = body as { supplierIds?: string[] };
    if (!supplierIds || supplierIds.length === 0) {
      return badRequest('supplierIds is required');
    }

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');
    if (!rfq.rfqDocument || !rfq.hasContent) {
      return badRequest('This RFQ has no content yet. Run "update" in the chat first.');
    }

    const selectedSuppliers = await db
      .select()
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds));

    if (selectedSuppliers.length === 0) return badRequest('No matching suppliers');

    // Don't double-invite suppliers already on this RFQ.
    const existing = await db
      .select({ supplierId: rfqInvitations.supplierId })
      .from(rfqInvitations)
      .where(eq(rfqInvitations.rfqId, id));
    const alreadyInvited = new Set(existing.map((e) => e.supplierId));
    const toInvite = selectedSuppliers.filter((s) => !alreadyInvited.has(s.id));

    if (toInvite.length === 0) {
      return badRequest('All selected suppliers have already been invited');
    }

    const doc = normalizeRFQDocument(rfq.rfqDocument, {
      rfqId: rfq.id,
      buyer: user.name,
    });
    const summary = rfqDocumentToText(doc).slice(0, 600);

    const pdfBuffer = await generateRFQPDF({
      doc,
      issueDate: new Date(rfq.createdAt).toLocaleDateString(),
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const results: Array<{ supplier: string; email: string; sent: boolean; formLink: string; error?: string }> = [];

    for (const supplier of toInvite) {
      const [invitation] = await db
        .insert(rfqInvitations)
        .values({
          rfqId: id,
          supplierId: supplier.id,
          status: 'sent',
          sentAt: new Date(),
        })
        .returning();

      const formLink = `${appUrl}/quote/${invitation.token}`;

      const emailResult = await sendRFQEmail(
        {
          to: supplier.contactEmail,
          supplierName: supplier.companyName,
          rfqTitle: rfq.title,
          rfqSummary: summary,
          formLink,
          pdfAttachment: {
            filename: `RFQ-${rfq.id.slice(0, 8)}.pdf`,
            content: pdfBuffer,
          },
          deadline: rfq.deadline ? new Date(rfq.deadline).toISOString() : undefined,
        },
        rfq.id,
        invitation.id
      );

      results.push({
        supplier: supplier.companyName,
        email: supplier.contactEmail,
        sent: emailResult.success,
        formLink,
        error: emailResult.success ? undefined : emailResult.error,
      });
    }

    if (rfq.status === 'draft') {
      await db
        .update(rfqs)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(eq(rfqs.id, id));
    }

    return NextResponse.json({ results });
  } catch (error) {
    return serverError(error);
  }
}
