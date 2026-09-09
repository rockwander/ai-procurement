import { db } from '@/db';
import { rfqs, rfqLineItems, rfqInvitations, quoteSubmissions, suppliers } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { normalizeRFQDocument } from '@/lib/rfq-document';
import {
  normaliseLineResponse,
  normaliseLinePrice,
  committedQty,
} from '@/lib/line-response';
import type { QuoteEvaluationInput } from '@/lib/agents/quote-evaluation';

export interface QuoteEvalPayload {
  rfq: typeof rfqs.$inferSelect;
  rfqCurrency: string;
  lineItems: (typeof rfqLineItems.$inferSelect)[];
  /** everything the evaluation agent needs except the strategy string */
  evalInput: Omit<QuoteEvaluationInput, 'strategy'>;
}

/**
 * Load an RFQ's submitted quotes and normalise them into the shape the
 * quote-evaluation agent reasons over (currency / UoM normalised, partial
 * coverage detected, non-quoted lines dropped). Shared by the evaluate route
 * and the comparison-chat route so the two can't drift.
 *
 * Returns null if the RFQ doesn't exist. Returns an empty `quotes` array if
 * nothing is submitted yet — the caller decides whether that's an error.
 */
export async function loadQuoteEvalPayload(
  rfqId: string
): Promise<QuoteEvalPayload | null> {
  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, rfqId));
  if (!rfq) return null;

  const lineItems = await db
    .select()
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfqId, rfqId))
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
    .where(eq(rfqInvitations.rfqId, rfqId));

  const rfqDoc = rfq.rfqDocument
    ? normalizeRFQDocument(rfq.rfqDocument, { rfqId: rfq.id, buyer: '', fillDefaults: false })
    : null;
  const rfqCurrency = rfqDoc?.header.currency || 'INR';
  const lineById = new Map(lineItems.map((li) => [li.id, li]));

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
          if (resp.canSupply === 'no') return null;
          const norm = normaliseLinePrice(resp, rfqCurrency);
          const qty = committedQty(resp, askQty);
          const unitPrice = norm.pricePerAskedUnit;
          if (unitPrice == null) return null;
          return {
            itemId: String(li.itemId),
            itemDescription: String(li.itemDescription),
            quantity: qty,
            askedQuantity: askQty,
            unitPrice,
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

  return {
    rfq,
    rfqCurrency,
    lineItems,
    evalInput: {
      quotes,
      rfqLineItems: lineItems.map((li) => ({
        id: li.id,
        itemDescription: li.itemDescription,
        quantity: li.quantity,
      })),
    },
  };
}
