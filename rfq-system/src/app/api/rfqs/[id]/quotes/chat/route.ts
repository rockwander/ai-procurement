import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from '@/lib/api';
import { QuoteChatAgent, type QuoteChatColumn } from '@/lib/agents/quote-chat';
import { loadQuoteEvalPayload } from '@/lib/quote-eval-payload';

/**
 * The assistant beside the quote-comparison table. One turn is a question, a
 * table-filter request, or an award strategy — the agent classifies and the
 * page acts on the result. Nothing is persisted; the buyer's chat is an
 * analysis scratchpad (POC scale).
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
    const { message, history, columns, rowsText } = body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      columns?: QuoteChatColumn[];
      rowsText?: string;
    };

    if (!message || message.trim().length < 2) {
      return badRequest('message is required');
    }

    const payload = await loadQuoteEvalPayload(id);
    if (!payload) return notFound('RFQ not found');
    if (payload.evalInput.quotes.length === 0) {
      return badRequest('No submitted quotes to discuss yet');
    }

    const agent = new QuoteChatAgent();
    const result = await agent.chat(
      {
        message: message.trim(),
        conversationHistory: Array.isArray(history) ? history.slice(-12) : [],
        columns: Array.isArray(columns) ? columns : [],
        rowsText: rowsText ?? '',
        rfqCurrency: payload.rfqCurrency,
      },
      payload.evalInput,
      id
    );

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Chat failed' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ...result.data, usage: {
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    } });
  } catch (error) {
    return serverError(error);
  }
}
