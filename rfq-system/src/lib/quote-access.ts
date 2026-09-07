import { db } from '@/db';
import { rfqInvitations, rfqs, rfqLineItems, suppliers, quoteSubmissions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

/**
 * Load everything the public supplier form needs, keyed by the invitation token.
 * Returns null when the token is unknown.
 */
export async function loadQuoteContext(token: string) {
  const [row] = await db
    .select({
      invitation: rfqInvitations,
      rfq: rfqs,
      supplier: suppliers,
    })
    .from(rfqInvitations)
    .innerJoin(rfqs, eq(rfqInvitations.rfqId, rfqs.id))
    .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
    .where(eq(rfqInvitations.token, token));

  if (!row) return null;

  const lineItems = await db
    .select()
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfqId, row.rfq.id))
    .orderBy(asc(rfqLineItems.orderIndex));

  const [submission] = await db
    .select()
    .from(quoteSubmissions)
    .where(eq(quoteSubmissions.rfqInvitationId, row.invitation.id));

  return { ...row, lineItems, submission: submission ?? null };
}
