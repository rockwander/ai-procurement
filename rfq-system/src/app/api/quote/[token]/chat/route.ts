import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatMessages } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { AutofillAgent, type AutofillLineItem } from '@/lib/agents/autofill';
import { applyAgentPatches } from '@/lib/line-response-status';
import type { FormSchema } from '@/lib/form-schema';
import { normalizeRFQDocument } from '@/lib/rfq-document';

// Public: AI assistant for the supplier document-preview flow.
// The supplier types a message and/or attaches documents (optionally scoped to
// one field they clicked); the Autofill agent maps what it finds onto the fixed
// per-line grid + the buyer-defined quote-level / questionnaire fields, each
// value carrying a confidence and a one-line rationale.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');

    const history = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.rfqInvitationId, ctx.invitation.id))
      .orderBy(asc(chatMessages.createdAt));

    return NextResponse.json({ messages: history });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');
    if (ctx.invitation.status === 'submitted') {
      return badRequest('This quote has been submitted and can no longer be edited');
    }

    const body = await request.json();
    const { message, documentTexts, activeField } = body as {
      message?: string;
      documentTexts?: string[];
      activeField?: string;
    };

    if (!message && (!documentTexts || documentTexts.length === 0)) {
      return badRequest('Provide a message or at least one document');
    }

    const priorHistory = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.rfqInvitationId, ctx.invitation.id))
      .orderBy(asc(chatMessages.createdAt));

    const conversationHistory = priorHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const formSchema = (ctx.rfq.formSchema ?? { sections: [], fields: [] }) as FormSchema;
    const lineItems: AutofillLineItem[] = ctx.lineItems.map((li) => ({
      id: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity,
      unit: li.unit,
    }));

    const rfqDoc = ctx.rfq.rfqDocument
      ? normalizeRFQDocument(ctx.rfq.rfqDocument, {
          rfqId: ctx.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : null;
    const rfqCurrency = rfqDoc?.header.currency || 'INR';

    const agent = new AutofillAgent();
    const agentInput = {
      documentTexts: documentTexts ?? [],
      formSchema,
      lineItems,
      rfqCurrency,
      conversationHistory,
      activeField: activeField || undefined,
    };

    const hasDocs = !!(documentTexts && documentTexts.length > 0);
    const hasMessage = !!(message && message.trim());

    let assistantMessage = '';
    const patches: Record<
      string,
      { value: string | number; confidence: 'high' | 'medium' | 'low'; rationale: string }
    > = {};
    const missingFields: string[] = [];
    const suggestions: string[] = [];

    // A message that's just a cover note ("here's our quote") doesn't need a
    // conversational turn — extraction handles it.
    const coverNoteOnly =
      hasDocs &&
      (!hasMessage ||
        /\b(here('?s| is)|attached|please (fill|complete|extract|use)|our (quote|quotation|response|submission))\b/i.test(
          message!
        ));

    if (hasMessage && !coverNoteOnly) {
      const chat = await agent.chatResponse(message!, agentInput);
      if (chat.success && chat.data) {
        assistantMessage = chat.data.message;
        Object.assign(patches, chat.data.patches);
      } else {
        assistantMessage = `Sorry, I hit an error: ${chat.error}`;
      }
    } else if (hasDocs) {
      const extract = await agent.extractFormData(agentInput);
      if (extract.success && extract.data) {
        Object.assign(patches, extract.data.patches);
        missingFields.push(...extract.data.missingFields);
        suggestions.push(...extract.data.suggestions);
      } else {
        assistantMessage = `I couldn't read those documents: ${extract.error}`;
      }
    }

    const applied = applyAgentPatches(patches, formSchema.fields ?? []);

    // Compose a short summary when the doc path ran.
    if (hasDocs && !assistantMessage) {
      const nLine = Object.keys(applied.linePatches).length;
      const nForm = Object.keys(applied.formPatches).length;
      const parts = [
        `Read ${documentTexts!.length} document(s): updated ${nLine} line item(s)` +
          (nForm ? ` and ${nForm} quote-level field(s)` : '') + '.',
      ];
      if (missingFields.length) {
        parts.push(`Still needs your input: ${missingFields.join('; ')}.`);
      }
      if (suggestions.length) parts.push(suggestions.join(' '));
      assistantMessage = parts.join(' ');
    }

    await db.insert(chatMessages).values([
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'user',
        content:
          (message ?? '') +
          (activeField ? `\n\n[clarifying: ${activeField}]` : '') +
          (hasDocs ? `\n\n[provided ${documentTexts!.length} document(s)]` : ''),
        attachments: documentTexts?.map((_, i) => `document-${i + 1}`) ?? [],
      },
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'assistant',
        content: assistantMessage.trim(),
        extractedData: {
          linePatches: applied.linePatches,
          formPatches: applied.formPatches,
          provenance: applied.provenance,
        },
      },
    ]);

    return NextResponse.json({
      message: assistantMessage.trim(),
      linePatches: applied.linePatches,
      formPatches: applied.formPatches,
      provenance: applied.provenance,
      rejected: applied.rejected,
      missingFields,
      suggestions,
    });
  } catch (error) {
    return serverError(error);
  }
}
