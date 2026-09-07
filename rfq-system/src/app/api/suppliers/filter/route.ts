import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, badRequest, serverError } from '@/lib/api';
import { SupplierFilteringAgent } from '@/lib/agents/supplier-filtering';

/**
 * Procurement Pre-Filtering Agent: pull suppliers by category, then have the
 * AI rank them by fit and summarise past performance/flags/reviews.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { categories, minRating, excludeFlags, rfqId } = body as {
      categories?: string[];
      minRating?: number;
      excludeFlags?: string[];
      rfqId?: string;
    };

    if (!categories || categories.length === 0) {
      return badRequest('At least one category is required');
    }

    const agent = new SupplierFilteringAgent();
    const result = await agent.filterAndRankSuppliers(
      { categories, minRating, excludeFlags },
      rfqId
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Supplier filtering failed' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      suppliers: result.data ?? [],
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
