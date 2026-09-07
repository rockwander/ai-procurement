import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqInvitations } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';
import { emptyRFQDocument } from '@/lib/rfq-document';

// List all RFQs with a quote/invitation count summary
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const rows = await db
      .select({
        id: rfqs.id,
        title: rfqs.title,
        status: rfqs.status,
        deadline: rfqs.deadline,
        hasContent: rfqs.hasContent,
        createdAt: rfqs.createdAt,
        invitationCount: sql<number>`count(distinct ${rfqInvitations.id})`,
        submittedCount: sql<number>`count(distinct case when ${rfqInvitations.status} = 'submitted' then ${rfqInvitations.id} end)`,
      })
      .from(rfqs)
      .leftJoin(rfqInvitations, eq(rfqInvitations.rfqId, rfqs.id))
      .groupBy(rfqs.id)
      .orderBy(desc(rfqs.createdAt));

    return NextResponse.json({ rfqs: rows });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Create a fresh draft RFQ. It has no content yet — the buyer builds it up in
 * the create-RFQ chat (`/api/rfqs/[id]/draft-chat`) and each "update"
 * regenerates the document.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const { policyIds } = body as { policyIds?: string[] };

    const [rfq] = await db
      .insert(rfqs)
      .values({
        createdBy: user.userId,
        policyReferences: policyIds ?? [],
        status: 'draft',
        formSchema: { sections: [], fields: [] },
        hasContent: false,
      })
      .returning();

    // Seed the document with the buyer name + id so the first render is sane.
    const doc = emptyRFQDocument(rfq.id, user.name);
    await db.update(rfqs).set({ rfqDocument: doc }).where(eq(rfqs.id, rfq.id));

    return NextResponse.json({ rfq: { ...rfq, rfqDocument: doc } }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
