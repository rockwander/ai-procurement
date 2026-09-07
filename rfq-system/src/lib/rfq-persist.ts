import { db } from '@/db';
import { rfqs, rfqLineItems, rfqDocumentVersions } from '@/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import {
  RFQDocument,
  normalizeRFQDocument,
  rfqDocumentTitle,
  rfqDocumentToText,
} from '@/lib/rfq-document';
import { rfqDocumentToFormSchema } from '@/lib/form-schema';

/**
 * Persist an RFQ document as the RFQ's current state:
 * - store the structured document + derived form schema
 * - refresh title / description / deadline
 * - rewrite line items from the document
 * - append a version snapshot
 * Only allowed while the RFQ is still a draft.
 */
export async function applyRFQDocument(
  rfqId: string,
  doc: RFQDocument,
  source: 'ai' | 'manual'
): Promise<RFQDocument> {
  const clean = normalizeRFQDocument(doc, {
    rfqId,
    buyer: doc.header?.buyer || '',
  });

  const formSchema = rfqDocumentToFormSchema(clean);
  const title = rfqDocumentTitle(clean);
  const description = rfqDocumentToText(clean).slice(0, 2000);
  const deadline = parseLooseDate(clean.header.quoteDeadline);

  await db
    .update(rfqs)
    .set({
      rfqDocument: clean,
      formSchema,
      title,
      description,
      deadline,
      hasContent: true,
      updatedAt: new Date(),
    })
    .where(eq(rfqs.id, rfqId));

  // Rewrite line items from the document.
  await db.delete(rfqLineItems).where(eq(rfqLineItems.rfqId, rfqId));
  if (clean.lineItems.length > 0) {
    await db.insert(rfqLineItems).values(
      clean.lineItems.map((li, index) => ({
        rfqId,
        itemDescription: li.item || `Line ${li.line}`,
        quantity: li.quantity,
        unit: li.unit,
        specifications: { specification: li.specification },
        orderIndex: index,
      }))
    );
  }

  const [{ maxV } = { maxV: 0 }] = await db
    .select({ maxV: rfqDocumentVersions.version })
    .from(rfqDocumentVersions)
    .where(eq(rfqDocumentVersions.rfqId, rfqId))
    .orderBy(desc(rfqDocumentVersions.version))
    .limit(1);

  await db.insert(rfqDocumentVersions).values({
    rfqId,
    version: (maxV ?? 0) + 1,
    rfqDocument: clean,
    formSchema,
    source,
  });

  return clean;
}

/** Best-effort parse of a free-text deadline ("15 Sep 2026", "2026-09-15"). */
export function parseLooseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

export async function loadRFQLineItems(rfqId: string) {
  return db
    .select()
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfqId, rfqId))
    .orderBy(asc(rfqLineItems.orderIndex));
}
