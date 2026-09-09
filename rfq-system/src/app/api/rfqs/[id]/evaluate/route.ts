import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { QuoteEvaluationAgent } from '@/lib/agents/quote-evaluation';
import { loadQuoteEvalPayload } from '@/lib/quote-eval-payload';

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

    const payload = await loadQuoteEvalPayload(id);
    if (!payload) return notFound('RFQ not found');
    if (payload.evalInput.quotes.length === 0) {
      return badRequest('No submitted quotes to evaluate yet');
    }

    const agent = new QuoteEvaluationAgent();
    const result = await agent.evaluateQuotes(
      { ...payload.evalInput, strategy },
      id
    );

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Evaluation failed' },
        { status: 502 }
      );
    }

    if (payload.rfq.status === 'sent') {
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
