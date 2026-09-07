import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatMessages } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { AutofillAgent } from '@/lib/agents/autofill';

// Public: AI chat sidebar for the supplier form.
// Send a message (+ optional pasted document text) and get a reply plus
// suggested field updates the client can apply to the form.
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
    const { message, documentTexts, currentFormData } = body as {
      message?: string;
      documentTexts?: string[];
      currentFormData?: Record<string, unknown>;
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
    const formSchema = ctx.rfq.formSchema;

    let assistantMessage = '';
    let suggestedUpdates: Record<string, unknown> = {};
    let confidence: Record<string, string> = {};

    // If documents were provided, run structured extraction against the schema.
    if (documentTexts && documentTexts.length > 0) {
      const extract = await agent.extractFormData({
        documentTexts,
        formSchema,
        conversationHistory,
      });
      if (extract.success && extract.data) {
        suggestedUpdates = { ...suggestedUpdates, ...extract.data.extractedData };
        confidence = { ...confidence, ...extract.data.confidence };
        const found = Object.keys(extract.data.extractedData).length;
        assistantMessage =
          `I read ${documentTexts.length} document(s) and pulled ${found} field(s) into the form. ` +
          (extract.data.suggestions?.length ? extract.data.suggestions.join(' ') + ' ' : '') +
          (extract.data.missingFields?.length
            ? `Still need: ${extract.data.missingFields.join(', ')}.`
            : '');
      } else {
        assistantMessage = `I couldn't extract data from the documents: ${extract.error}. `;
      }
    }

    // Always run the conversational turn if there's a message.
    if (message) {
      const chat = await agent.chatResponse(message, {
        formSchema,
        currentFormData: currentFormData ?? {},
        conversationHistory,
      });
      if (chat.success && chat.data) {
        assistantMessage = (assistantMessage ? assistantMessage + '\n\n' : '') + chat.data.message;
        if (chat.data.suggestedUpdates) {
          suggestedUpdates = { ...suggestedUpdates, ...chat.data.suggestedUpdates };
        }
      } else if (!assistantMessage) {
        assistantMessage = `Sorry, I hit an error: ${chat.error}`;
      }
    }

    // Persist the exchange.
    const userContent =
      (message ?? '') +
      (documentTexts && documentTexts.length
        ? `\n\n[Uploaded ${documentTexts.length} document(s)]`
        : '');
    await db.insert(chatMessages).values([
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'user',
        content: userContent.trim(),
        attachments: documentTexts?.map((_, i) => `document-${i + 1}`) ?? [],
      },
      {
        rfqInvitationId: ctx.invitation.id,
        role: 'assistant',
        content: assistantMessage,
        extractedData: suggestedUpdates,
      },
    ]);

    return NextResponse.json({
      message: assistantMessage,
      suggestedUpdates,
      confidence,
    });
  } catch (error) {
    return serverError(error);
  }
}
