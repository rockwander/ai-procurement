import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { rfqs, rfqDraftMessages, policyDocuments } from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import {
  getAuthUser,
  unauthorized,
  notFound,
  badRequest,
  serverError,
} from '@/lib/api';
import { RFQDraftingAgent, type RFQThreadEntry } from '@/lib/agents/rfq-drafting';
import { applyRFQDocument } from '@/lib/rfq-persist';
import { normalizeRFQDocument, type RFQDocument } from '@/lib/rfq-document';

/**
 * The create-RFQ conversation.
 * GET  → the thread so far + current RFQ document.
 * POST → append a turn. If `action === 'update'`, run the Drafting Agent over
 *        the whole thread and regenerate the RFQ document.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');

    const messages = await db
      .select()
      .from(rfqDraftMessages)
      .where(eq(rfqDraftMessages.rfqId, id))
      .orderBy(asc(rfqDraftMessages.createdAt));

    return NextResponse.json({
      messages,
      rfqDocument: rfq.rfqDocument ?? null,
      hasContent: rfq.hasContent,
      status: rfq.status,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    const { id } = await params;

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id));
    if (!rfq) return notFound('RFQ not found');
    if (rfq.status !== 'draft') {
      return badRequest('This RFQ has already been sent and can no longer be edited');
    }

    const body = await request.json();
    const { message, action } = body as {
      message?: string;
      action?: 'message' | 'update';
    };
    const text = (message ?? '').trim();

    if (action !== 'update' && !text) {
      return badRequest('message is required');
    }

    // Record the buyer's turn.
    await db.insert(rfqDraftMessages).values({
      rfqId: id,
      role: 'user',
      kind: action === 'update' ? 'update' : 'message',
      content: text || '(update)',
    });

    if (action !== 'update') {
      // Plain message — acknowledge, no regeneration.
      const [saved] = await db
        .insert(rfqDraftMessages)
        .values({
          rfqId: id,
          role: 'assistant',
          kind: 'message',
          content:
            'Got it. Add more details or documents whenever you\'re ready, then say "update" and I\'ll (re)generate the RFQ from everything so far.',
        })
        .returning();
      return NextResponse.json({ assistant: saved, regenerated: false });
    }

    // --- "update": regenerate the RFQ document from the whole thread ---
    const history = await db
      .select()
      .from(rfqDraftMessages)
      .where(eq(rfqDraftMessages.rfqId, id))
      .orderBy(asc(rfqDraftMessages.createdAt));

    const thread: RFQThreadEntry[] = history.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      kind: h.kind,
      content: h.content,
      attachmentName: h.attachmentName ?? undefined,
    }));

    const policyIds = Array.isArray(rfq.policyReferences)
      ? (rfq.policyReferences as string[])
      : [];
    const policies = policyIds.length
      ? await db
          .select()
          .from(policyDocuments)
          .where(inArray(policyDocuments.id, policyIds))
      : [];

    const agent = new RFQDraftingAgent();
    const result = await agent.draftRFQ({
      thread,
      policyDocuments: policies.map((p) => ({
        title: p.title,
        content: p.content,
        category: p.category,
      })),
      buyerName: user.name,
      rfqId: id,
      currentDocument: (rfq.rfqDocument as RFQDocument) ?? null,
    });

    if (!result.success || !result.data) {
      const [saved] = await db
        .insert(rfqDraftMessages)
        .values({
          rfqId: id,
          role: 'assistant',
          kind: 'message',
          content: `I couldn't generate the RFQ: ${result.error ?? 'unknown error'}. Try rephrasing or adding more detail, then say "update" again.`,
        })
        .returning();
      return NextResponse.json({ assistant: saved, regenerated: false }, { status: 502 });
    }

    const applied = await applyRFQDocument(id, result.data, 'ai');

    const [saved] = await db
      .insert(rfqDraftMessages)
      .values({
        rfqId: id,
        role: 'assistant',
        kind: 'message',
        content:
          `Updated the RFQ from the thread so far: ${applied.lineItems.length} line item(s), ` +
          `${applied.commercialFields.length} commercial field(s), ` +
          `${applied.questionnaire.length} questionnaire question(s). ` +
          `Switch to the form builder to fine-tune, or keep chatting and say "update" again.`,
      })
      .returning();

    return NextResponse.json({
      assistant: saved,
      regenerated: true,
      rfqDocument: applied,
      usage: { tokensUsed: result.tokensUsed, costUsd: result.costUsd },
    });
  } catch (error) {
    return serverError(error);
  }
}
