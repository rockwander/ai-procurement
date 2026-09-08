import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqLineItems, rfqInvitations, quoteSubmissions, suppliers } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { QuoteEvaluationAgent } from '@/lib/agents/quote-evaluation';
import { normalizeRFQDocument } from '@/lib/rfq-document';
import {
  normaliseLineResponse,
  normaliseLinePrice,
  committedQty,
} from '@/lib/line-response';

/**
 * Apply a natural-language procurement strategy to the submitted quotes.
 * Returns the proposed award split (which supplier gets which line items, at
 * what price) plus reasoning. Nothing is persisted — the client shows a
 * summary, then calls /api/rfqs/[id]/award to confirm.
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
    const { strategy } = body as { strategy?: string };
    if (!strategy || strategy.trim().length < 3) {
      return badRequest('strategy is required');
    }

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');

    const lineItems = await db
      .select()
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, id))
      .orderBy(asc(rfqLineItems.orderIndex));

    const rows = await db
      .select({
        invitation: rfqInvitations,
        submission: quoteSubmissions,
        supplier: suppliers,
      })
      .from(rfqInvitations)
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .innerJoin(
        quoteSubmissions,
        eq(quoteSubmissions.rfqInvitationId, rfqInvitations.id)
      )
      .where(eq(rfqInvitations.rfqId, id));

    if (rows.length === 0) {
      return badRequest('No submitted quotes to evaluate yet');
    }

    const rfqDoc = rfq.rfqDocument
      ? normalizeRFQDocument(rfq.rfqDocument, { rfqId: rfq.id, buyer: '', fillDefaults: false })
      : null;
    const rfqCurrency = rfqDoc?.header.currency || 'INR';
    const lineById = new Map(
      lineItems.map((li) => [li.id, li])
    );

    const quotes = rows.map((r) => {
      const submittedLineItems = (r.submission.lineItems as Array<any>) ?? [];
      const formData = (r.submission.formData as Record<string, any>) ?? {};
      const deliveryRaw =
        formData.deliveryDays ?? formData.delivery_days ?? formData.deliveryTime;
      const deliveryDays = deliveryRaw != null ? Number(deliveryRaw) : undefined;
      return {
        submissionId: r.submission.id,
        supplierId: r.supplier.id,
        supplierName: r.supplier.companyName,
        lineItems: submittedLineItems
          .map((li) => {
            const askLine = lineById.get(String(li.itemId));
            const askQty = askLine ? askLine.quantity : Number(li.quantity) || 0;
            const resp = normaliseLineResponse(
              li,
              {
                id: String(li.itemId),
                itemDescription: String(li.itemDescription),
                quantity: askQty,
                unit: askLine?.unit ?? '',
              },
              rfqCurrency
            );
            if (resp.canSupply === 'no') return null; // not on offer — exclude
            const norm = normaliseLinePrice(resp, rfqCurrency);
            const qty = committedQty(resp, askQty);
            const unitPrice = norm.pricePerAskedUnit;
            if (unitPrice == null) return null;
            return {
              itemId: String(li.itemId),
              itemDescription: String(li.itemDescription),
              quantity: qty, // quantity this supplier can actually supply
              askedQuantity: askQty,
              unitPrice, // normalised to the RFQ's asked unit
              totalPrice: unitPrice * qty,
              currency: resp.currency,
              currencyDiffersFromRfq: norm.currencyDiffers,
              uomAmbiguous: norm.uomAmbiguous,
              partial: qty < askQty,
              leadTimeDays: resp.leadTimeDays ?? undefined,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null),
        totalAmount: r.submission.totalAmount,
        deliveryDays: Number.isFinite(deliveryDays) ? deliveryDays : undefined,
        notes: r.submission.notes ?? undefined,
      };
    });

    const agent = new QuoteEvaluationAgent();
    const result = await agent.evaluateQuotes(
      {
        strategy,
        quotes,
        rfqLineItems: lineItems.map((li) => ({
          id: li.id,
          itemDescription: li.itemDescription,
          quantity: li.quantity,
        })),
      },
      id
    );

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Evaluation failed' },
        { status: 502 }
      );
    }

    if (rfq.status === 'sent') {
      await db
        .update(rfqs)
        .set({ status: 'evaluating', updatedAt: new Date() })
        .where(eq(rfqs.id, id));
    }

    return NextResponse.json({
      evaluation: result.data,
      usage: {
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
