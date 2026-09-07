import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqLineItems, rfqInvitations } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getAuthUser, unauthorized, badRequest, serverError } from '@/lib/api';

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

// Create (save) an RFQ from a reviewed draft + edited form schema
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { title, description, generatedContent, formSchema, lineItems, policyIds, deadline } =
      body as {
        title?: string;
        description?: string;
        generatedContent?: unknown;
        formSchema?: unknown;
        lineItems?: Array<{
          itemDescription: string;
          quantity: number;
          unit: string;
          specifications?: Record<string, unknown>;
        }>;
        policyIds?: string[];
        deadline?: string;
      };

    if (!title) return badRequest('title is required');
    if (!description) return badRequest('description is required');
    if (!formSchema) return badRequest('formSchema is required');

    const [rfq] = await db
      .insert(rfqs)
      .values({
        title,
        description,
        createdBy: user.userId,
        policyReferences: policyIds ?? [],
        status: 'draft',
        deadline: deadline ? new Date(deadline) : null,
        formSchema,
        generatedContent:
          generatedContent != null ? JSON.stringify(generatedContent) : null,
      })
      .returning();

    if (lineItems && lineItems.length > 0) {
      await db.insert(rfqLineItems).values(
        lineItems.map((li, index) => ({
          rfqId: rfq.id,
          itemDescription: li.itemDescription,
          quantity: li.quantity,
          unit: li.unit,
          specifications: li.specifications ?? {},
          orderIndex: index,
        }))
      );
    }

    return NextResponse.json({ rfq }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
