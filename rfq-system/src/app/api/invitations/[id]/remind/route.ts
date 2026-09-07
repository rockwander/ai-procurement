import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqInvitations, rfqs, suppliers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { sendReminderEmail } from '@/lib/email';

// Manually re-send the RFQ form link to a supplier who hasn't submitted yet.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [row] = await db
      .select({
        invitation: rfqInvitations,
        rfq: rfqs,
        supplier: suppliers,
      })
      .from(rfqInvitations)
      .innerJoin(rfqs, eq(rfqInvitations.rfqId, rfqs.id))
      .innerJoin(suppliers, eq(rfqInvitations.supplierId, suppliers.id))
      .where(eq(rfqInvitations.id, id));

    if (!row) return notFound('Invitation not found');
    if (row.invitation.status === 'submitted') {
      return badRequest('Supplier has already submitted a quote');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const formLink = `${appUrl}/quote/${row.invitation.token}`;

    let daysRemaining: number | undefined;
    if (row.rfq.deadline) {
      const diff = new Date(row.rfq.deadline).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const result = await sendReminderEmail(
      {
        to: row.supplier.contactEmail,
        supplierName: row.supplier.companyName,
        rfqTitle: row.rfq.title,
        formLink,
        deadline: row.rfq.deadline ? new Date(row.rfq.deadline).toISOString() : undefined,
        daysRemaining,
      },
      id
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const [updated] = await db
      .update(rfqInvitations)
      .set({
        remindersSent: (row.invitation.remindersSent ?? 0) + 1,
        lastReminderAt: new Date(),
      })
      .where(eq(rfqInvitations.id, id))
      .returning();

    return NextResponse.json({ invitation: updated });
  } catch (error) {
    return serverError(error);
  }
}
