import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatMessages } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { AutofillAgent, type AutofillLineItem } from '@/lib/agents/autofill';
import { coerceExtraction } from '@/lib/form-coerce';
import type { FormSchema } from '@/lib/form-schema';

// Public: AI assistant for the supplier quote form.
// Accepts a message and/or the text of any documents the supplier provides,
// extracts what fits the fixed form, coerces each value to what the control
// accepts, and returns form-ready updates plus anything that needs manual entry.
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
    const { message, documentTexts, currentFormData, currentLinePrices } = body as {
      message?: string;
      documentTexts?: string[];
      currentFormData?: Record<string, unknown>;
      currentLinePrices?: Record<string, number>;
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

    const agent = new AutofillAgent();
    const formSchema = (ctx.rfq.formSchema ?? { sections: [], fields: [] }) as FormSchema;
    const lineItems: AutofillLineItem[] = ctx.lineItems.map((li) => ({
      id: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity,
      unit: li.unit,
    }));
    const lineItemIds = new Set(lineItems.map((l) => l.id));

    let assistantMessage = '';
    const rawExtraction: Record<string, string | number> = {};
    const confidence: Record<string, string> = {};
    const hasDocs = !!(documentTexts && documentTexts.length > 0);

    if (hasDocs) {
      const extract = await agent.extractFormData({
        documentTexts,
        formSchema,
        lineItems,
        conversationHistory,
      });
      if (extract.success && extract.data) {
        Object.assign(rawExtraction, extract.data.extractedData);
        Object.assign(confidence, extract.data.confidence);
      } else {
        assistantMessage = `I couldn't read those documents: ${extract.error}. `;
      }
    }

    // Only run the conversational turn when the message carries substance of its
    // own. If documents are the payload and the message is just a cover note
    // ("here is our quote, please fill the form"), the extraction path handles it
    // and a chat reply would only add a canned "please paste your details" line.
    const coverNoteOnly =
      hasDocs &&
      (!message ||
        /\b(here('?s| is)|attached|please (fill|complete|extract|use)|our (quote|quotation|response|submission))\b/i.test(
          message
        ));

    if (message && !coverNoteOnly) {
      const chat = await agent.chatResponse(message, {
        formSchema,
        lineItems,
        currentFormData: currentFormData ?? {},
        currentLinePrices: currentLinePrices ?? {},
        conversationHistory,
      });
      if (chat.success && chat.data) {
        assistantMessage = (assistantMessage ? assistantMessage + '\n\n' : '') + chat.data.message;
        if (chat.data.suggestedUpdates) {
          Object.assign(rawExtraction, chat.data.suggestedUpdates);
        }
      } else if (!assistantMessage) {
        assistantMessage = `Sorry, I hit an error: ${chat.error}`;
      }
    }

    // Coerce everything the agent produced into form-ready values.
    const coerced = coerceExtraction(rawExtraction, formSchema, lineItemIds);

    // Build a helpful assistant summary if the doc path produced the message.
    if (hasDocs) {
      const fieldCount = Object.keys(coerced.fields).length;
      const priceCount = Object.keys(coerced.lineItemPrices).length;
      const parts: string[] = [];
      parts.push(
        `From ${documentTexts.length} document(s): filled ${fieldCount} field(s)` +
          (priceCount ? ` and ${priceCount} line-item price(s)` : '') + '.'
      );
      if (coerced.unresolved.length) {
        parts.push(
          `Couldn't auto-fill (please key these in): ` +
            coerced.unresolved.map((u) => u.label).join('; ') + '.'
        );
      }
      const noteFields = Object.keys(coerced.notes).filter(
        (id) => !coerced.unresolved.some((u) => u.fieldId === id)
      );
      if (noteFields.length) {
        const labelOf = new Map(formSchema.fields.map((f) => [f.id, f.label]));
        parts.push(
          `Shortened to fit the form (full text kept for your review): ` +
            noteFields.map((id) => labelOf.get(id) ?? id).join('; ') + '.'
        );
      }
      const missingPrices = lineItems.filter((l) => !coerced.lineItemPrices[l.id]).length;
      if (missingPrices) {
        parts.push(`${missingPrices} line item(s) still need a unit price.`);
      }
      assistantMessage = (assistantMessage ? assistantMessage + '\n\n' : '') + parts.join(' ');
    }

    await db.insert(chatMessages).values([
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'user',
        content:
          (message ?? '') +
          (documentTexts && documentTexts.length ? `\n\n[Provided ${documentTexts.length} document(s)]` : ''),
        attachments: documentTexts?.map((_, i) => `document-${i + 1}`) ?? [],
      },
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'assistant',
        content: assistantMessage.trim(),
        extractedData: {
          fields: coerced.fields,
          lineItemPrices: coerced.lineItemPrices,
          notes: coerced.notes,
        },
      },
    ]);

    return NextResponse.json({
      message: assistantMessage.trim(),
      // form-ready
      fields: coerced.fields,
      lineItemPrices: coerced.lineItemPrices,
      notes: coerced.notes,
      unresolved: coerced.unresolved,
      confidence,
    });
  } catch (error) {
    return serverError(error);
  }
}
