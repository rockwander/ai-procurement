import { BaseAgent, AgentResponse } from './base';

export interface QuoteCommentInput {
  rfqTitle: string;
  supplierName: string;
  buyerName: string;
  /** the buyer's raw comments on the supplier's submitted quote */
  comments: Array<{
    id: string;
    /** e.g. "Line 3 — Unit price" or "Payment terms" */
    fieldLabel: string;
    /** what the supplier had quoted for that field, if any */
    quotedValue: string | null;
    comment: string;
  }>;
}

export interface ClassifiedComment {
  id: string;
  /** 'review' = clarify / complete / fix an answer; 'negotiation' = ask to revise terms */
  intent: 'review' | 'negotiation';
  /** one short sentence: why this classification */
  reason: string;
}

export interface QuoteCommentResult {
  classified: ClassifiedComment[];
  /** the outbound email copy, already adapted to what the round contains */
  email: {
    /** short subject phrase, no "RFQ:" prefix, no ref marker */
    subject: string;
    /** one-line banner headline */
    headline: string;
    /** 1–2 sentence opening paragraph (plain text, no HTML) */
    intro: string;
  };
}

/**
 * Reads the buyer's free-text comments on a supplier's submitted quotation and
 * (1) tags each as a *review* item (clarification / completion / a wrong or
 * missing answer) or a *negotiation* item (a request to move price, lead time,
 * payment terms, or other commercial terms), and (2) drafts the outbound
 * message, adapting the tone to whether the round is review-only,
 * negotiation-only, or both. See REQUIREMENT_quote-negotiation.md.
 */
export class QuoteCommentAgent extends BaseAgent {
  async classifyAndDraft(
    input: QuoteCommentInput,
    rfqId?: string
  ): Promise<AgentResponse<QuoteCommentResult>> {
    const startTime = Date.now();
    try {
      const { text, tokensUsed } = await this.callGemini(this.buildUserMessage(input), {
        systemInstruction: this.buildSystemPrompt(),
        temperature: 0.4,
      });

      const raw = this.parseJsonResponse<any>(text);
      const byId = new Map(input.comments.map((c) => [c.id, c]));

      const classified: ClassifiedComment[] = Array.isArray(raw?.classified)
        ? raw.classified
            .filter((c: any) => byId.has(String(c?.id)))
            .map((c: any) => ({
              id: String(c.id),
              intent: c?.intent === 'negotiation' ? 'negotiation' : 'review',
              reason: String(c?.reason ?? '').trim(),
            }))
        : [];

      // Anything the model dropped defaults to 'review'.
      for (const c of input.comments) {
        if (!classified.some((x) => x.id === c.id)) {
          classified.push({ id: c.id, intent: 'review', reason: '' });
        }
      }

      const hasNeg = classified.some((c) => c.intent === 'negotiation');
      const hasRev = classified.some((c) => c.intent === 'review');
      const fallbackHeadline = hasNeg && hasRev
        ? 'A few clarifications and points to discuss'
        : hasNeg
        ? 'We would like to revise a few points'
        : 'A few points need your attention';

      const email = {
        subject: String(raw?.email?.subject ?? `Your quotation for ${input.rfqTitle}`).trim(),
        headline: String(raw?.email?.headline ?? fallbackHeadline).trim(),
        intro: String(
          raw?.email?.intro ??
            'We have reviewed your quotation and need you to address the points below. Please open your quotation at the link, make any changes, and resubmit.'
        ).trim(),
      };

      const durationMs = Date.now() - startTime;
      const costUsd = this.calculateCost(tokensUsed);
      await this.logExecution({
        agentType: 'evaluation',
        rfqId,
        inputData: { comments: input.comments.length },
        outputData: {
          negotiation: classified.filter((c) => c.intent === 'negotiation').length,
          review: classified.filter((c) => c.intent === 'review').length,
        },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      return {
        success: true,
        data: { classified, email },
        tokensUsed,
        costUsd,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logExecution({
        agentType: 'evaluation',
        rfqId,
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });
      return { success: false, error: errorMessage, durationMs };
    }
  }

  private buildSystemPrompt(): string {
    return `You help a procurement buyer send comments on a supplier's submitted
quotation back to that supplier. Do two things:

1. CLASSIFY each comment as exactly one of:
   - "review": the buyer needs a clarification, a missing value filled in, a
     correction to an answer that doesn't match what the RFQ asked, or
     information the supplier (or the system) left out. No commercial demand.
   - "negotiation": the buyer is asking the supplier to CHANGE a commercial
     term in the buyer's favour — a lower price, a shorter lead time, better
     payment terms, higher committed quantity, dropped surcharge, etc.
   If a single comment does both, pick "negotiation" (the stronger ask).

2. DRAFT the outbound message copy, adapting to the mix:
   - review only  → neutral, "we need to clarify / complete a few things".
   - negotiation only → courteous but clear we want revised terms.
   - both → acknowledge both: clarifications AND points to discuss.
   Keep it professional and short. Do NOT list the individual comments in the
   intro — they are shown separately. No placeholders, no markdown, no HTML.

Return ONLY JSON:
{
  "classified": [ { "id": "<comment id>", "intent": "review"|"negotiation", "reason": "<one short sentence>" } ],
  "email": {
    "subject": "<short phrase, e.g. 'Clarifications on your quotation' — no 'RFQ:' prefix>",
    "headline": "<one line for the email banner>",
    "intro": "<1-2 sentences, plain text>"
  }
}`;
  }

  private buildUserMessage(input: QuoteCommentInput): string {
    const lines = input.comments
      .map(
        (c) =>
          `- id ${c.id} | field: ${c.fieldLabel}` +
          (c.quotedValue != null && c.quotedValue !== ''
            ? ` | supplier quoted: ${c.quotedValue}`
            : '') +
          `\n  comment: ${c.comment}`
      )
      .join('\n');

    return `RFQ: ${input.rfqTitle}
Supplier: ${input.supplierName}
Buyer: ${input.buyerName}

The buyer's comments on the submitted quotation:
${lines}

Classify each and draft the message. Return the JSON now.`;
  }
}
