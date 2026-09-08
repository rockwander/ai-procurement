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
import type { RFQDocument } from '@/lib/rfq-document';
import {
  documentFromOutline,
  outlineToText,
  type RFQOutline,
} from '@/lib/rfq-outline';
import { sanitizeText } from '@/lib/doc-extract';

/**
 * The create-RFQ conversation. Flow (MASTER_SPEC §2 step 1):
 *   action 'message'  → append a note, no regeneration
 *   action 'outline'  → Drafting Agent proposes an outline (2 groups, ticked
 *                       sub-headings); stored as rfqs.pendingOutline
 *   action 'apply'    → { tickedSectionIds } → rebuild the RFQ from the ticked
 *                       sections, regenerate PDF + form, clear the outline
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
      pendingOutline: rfq.pendingOutline ?? null,
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
    const { message, action, tickedSectionIds, editedDocument } = body as {
      message?: string;
      action?: 'message' | 'outline' | 'apply';
      tickedSectionIds?: string[];
      editedDocument?: RFQDocument;
    };
    const text = sanitizeText(message ?? '');

    // ---------------------------------------------------------------- apply --
    if (action === 'apply') {
      const outline = rfq.pendingOutline as RFQOutline | null;
      if (!outline) {
        return badRequest('There is no outline to apply. Ask me to build the RFQ first.');
      }
      const ticked = new Set(tickedSectionIds ?? outline.sections.map((s) => s.id));
      // The buyer may have edited section content in the outline review. Trust
      // the edited document (deterministic, no AI) but keep the drafting agent's
      // id so it stays stable across rounds.
      const baseDoc = editedDocument
        ? { ...editedDocument, header: { ...editedDocument.header, rfqId: outline.document.header.rfqId } }
        : outline.document;
      const withTicks: RFQOutline = {
        document: baseDoc,
        sections: outline.sections.map((s) => ({ ...s, ticked: ticked.has(s.id) })),
      };
      const doc = documentFromOutline(withTicks);
      const applied = await applyRFQDocument(id, doc, 'ai');

      // Remember which named sections the buyer excluded, so the next outline
      // keeps them unticked and the Drafting Agent doesn't re-add them.
      const namedKinds = new Set(['lineItems', 'commercialFields', 'questionnaire', 'supportingDocs', 'header']);
      const excluded = withTicks.sections
        .filter((s) => !s.ticked && namedKinds.has(s.kind))
        .map((s) => s.heading);
      await db
        .update(rfqs)
        .set({ pendingOutline: null, excludedSections: excluded })
        .where(eq(rfqs.id, id));
      const [saved] = await db
        .insert(rfqDraftMessages)
        .values({
          rfqId: id,
          role: 'assistant',
          kind: 'apply',
          content:
            `Applied to the RFQ: ${applied.lineItems.length} line item(s), ` +
            `${applied.commercialFields.length} commercial field(s), ` +
            `${applied.questionnaire.length} question(s), ` +
            `${applied.termsAndConditions.length} term(s).` +
            (excluded.length ? ` Left out: ${excluded.join('; ')}.` : '') +
            ` Keep chatting to revise, or use the form builder for direct edits.`,
        })
        .returning();

      return NextResponse.json({
        assistant: saved,
        applied: true,
        rfqDocument: applied,
        pendingOutline: null,
      });
    }

    // Record the buyer's turn for message / outline.
    await db.insert(rfqDraftMessages).values({
      rfqId: id,
      role: 'user',
      kind: action === 'outline' ? 'update' : 'message',
      content: text || (action === 'outline' ? '(build the RFQ)' : ''),
    });

    // -------------------------------------------------------------- message --
    if (action !== 'outline') {
      if (!text) return badRequest('message is required');
      const [saved] = await db
        .insert(rfqDraftMessages)
        .values({
          rfqId: id,
          role: 'assistant',
          kind: 'message',
          content:
            'Got it. Add more details or documents, then hit "Build / update RFQ" and I\'ll propose an outline for you to confirm.',
        })
        .returning();
      return NextResponse.json({ assistant: saved, regenerated: false });
    }

    // -------------------------------------------------------------- outline --
    const history = await db
      .select()
      .from(rfqDraftMessages)
      .where(eq(rfqDraftMessages.rfqId, id))
      .orderBy(asc(rfqDraftMessages.createdAt));

    const thread: RFQThreadEntry[] = history.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      kind: (h.kind === 'attachment' ? 'attachment' : h.kind === 'update' ? 'update' : 'message') as RFQThreadEntry['kind'],
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

    const excludedSections = Array.isArray(rfq.excludedSections)
      ? (rfq.excludedSections as string[])
      : [];

    const agent = new RFQDraftingAgent();
    const result = await agent.draftOutline(
      {
        thread,
        policyDocuments: policies.map((p) => ({
          title: p.title,
          content: p.content,
          category: p.category,
        })),
        buyerName: user.name,
        rfqId: id,
        currentDocument: (rfq.rfqDocument as RFQDocument) ?? null,
        excludedSections,
      },
      (rfq.pendingOutline as RFQOutline | null) ?? null,
      id
    );

    if (!result.success || !result.data) {
      const [saved] = await db
        .insert(rfqDraftMessages)
        .values({
          rfqId: id,
          role: 'assistant',
          kind: 'message',
          content: `I couldn't build the outline: ${result.error ?? 'unknown error'}. Try adding more detail, then build again.`,
        })
        .returning();
      return NextResponse.json({ assistant: saved, regenerated: false }, { status: 502 });
    }

    const outline = result.data;
    // A previously-excluded section that the agent re-added (because the buyer
    // asked) comes back ticked — drop it from the persisted exclusion list.
    const stillExcluded = excludedSections.filter((h) =>
      outline.sections.some(
        (s) => s.heading.toLowerCase() === h.toLowerCase() && !s.ticked
      )
    );
    await db
      .update(rfqs)
      .set({ pendingOutline: outline, excludedSections: stillExcluded })
      .where(eq(rfqs.id, id));

    const [saved] = await db
      .insert(rfqDraftMessages)
      .values({
        rfqId: id,
        role: 'assistant',
        kind: 'outline',
        content: outlineToText(outline),
      })
      .returning();

    return NextResponse.json({
      assistant: saved,
      outline: true,
      pendingOutline: outline,
      usage: { tokensUsed: result.tokensUsed, costUsd: result.costUsd },
    });
  } catch (error) {
    return serverError(error);
  }
}
