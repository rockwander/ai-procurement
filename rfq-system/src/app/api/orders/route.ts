import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { purchaseOrders, rfqs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAuthUser, unauthorized, serverError } from '@/lib/api';

// List all purchase orders
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const rows = await db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        totalValue: purchaseOrders.totalValue,
        currency: purchaseOrders.currency,
        strategyUsed: purchaseOrders.strategyUsed,
        createdAt: purchaseOrders.createdAt,
        awards: purchaseOrders.awards,
        rfqTitle: rfqs.title,
        rfqId: rfqs.id,
      })
      .from(purchaseOrders)
      .innerJoin(rfqs, eq(purchaseOrders.rfqId, rfqs.id))
      .orderBy(desc(purchaseOrders.createdAt));

    return NextResponse.json({ orders: rows });
  } catch (error) {
    return serverError(error);
  }
}
