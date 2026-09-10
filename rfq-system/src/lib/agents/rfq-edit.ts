import { BaseAgent, AgentResponse } from './base';
import {
  RFQDocument,
  normalizeRFQDocument,
  rfqDocumentToText,
} from '@/lib/rfq-document';
import type { RFQThreadEntry } from './rfq-drafting';

export interface RFQEditInput {
  /** The current RFQ document to be edited. */
  doc: RFQDocument;
  /** The buyer's latest chat message — the instruction to apply. */
  instruction: string;
  /** Recent create-RFQ conversation for context (oldest first). */
  thread: RFQThreadEntry[];
  buyerName: string;
  rfqId: string;
}

export interface RFQEditResult {
  doc: RFQDocument;
  /** one-line summary of what changed, for the chat */
  summary: string;
}

/**
 * Natural-language refinements to an already-drafted RFQ document. The buyer
 * types things like "make Freight charges required", "rename GST to Tax %",
 * "add a yes/no question about credit terms", "remove the price validity field",
 * "make the payment terms field a dropdown of Net 30 / Net 45 / Net 60".
 *
 * This does NOT re-draft the RFQ from scratch — it takes the current document
 * and returns it with only the requested changes applied. Structural
 * (re)generation still goes through the outline → confirm → apply flow.
 */
export class RFQEditAgent extends BaseAgent {
  async applyEdit(
    input: RFQEditInput,
    rfqId?: string
  ): Promise<AgentResponse<RFQEditResult>> {
    const startTime = Date.now();
    try {
      const { text, tokensUsed } = await this.callGemini(
        this.buildUserMessage(input),
        { systemInstruction: this.buildSystemPrompt(), temperature: 0.3 }
      );

      const durationMs = Date.now() - startTime;
      const parsed = this.parseJsonResponse<any>(text);

      const doc = normalizeRFQDocument(parsed.document ?? parsed, {
        rfqId: input.rfqId,
        buyer: input.buyerName,
        fillDefaults: false,
      });
      const summary =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : 'Updated the RFQ.';

      const costUsd = this.calculateCost(tokensUsed);
      await this.logExecution({
        agentType: 'drafting',
        rfqId: rfqId ?? input.rfqId,
        inputData: { instruction: input.instruction.slice(0, 500) },
        outputData: {
          lineItems: doc.lineItems.length,
          commercialFields: doc.commercialFields.length,
          questions: doc.questionnaire.length,
        },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      return { success: true, data: { doc, summary }, tokensUsed, costUsd, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logExecution({
        agentType: 'drafting',
        rfqId: rfqId ?? input.rfqId,
        inputData: { instruction: input.instruction.slice(0, 500) },
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });
      console.error('❌ RFQ edit failed:', error);
      return { success: false, error: errorMessage, durationMs };
    }
  }

  private buildSystemPrompt(): string {
    return `You edit an existing Request for Quotation (RFQ) definition on the buyer's
instruction. You are given the current RFQ as JSON and one plain-language
instruction. Apply ONLY what the buyer asked for and return the full updated
document.

The buyer may ask you to:
- rename a field or question (change its "label" / "question" text)
- make a field required or optional (the "required" boolean)
- change a field's datatype: commercialFields "type" is "text" | "number" |
  "select"; questionnaire "responseType" is "yesno" | "text" | "file"
- add or change the choices of a "select" field (the "options" array)
- add a new commercial field or questionnaire question
- remove a field or question
- reorder fields or questions
- adjust header values, line items, terms — only if explicitly asked

Return ONLY a JSON object:
{
  "document": { ...the full updated RFQDocument, same shape as the input... },
  "summary": "one short sentence describing what you changed"
}

Rules:
- Preserve every "id" you were given. Mint a new id (any short unique string)
  ONLY for a field/question the buyer is genuinely adding.
- Change "required" to true ONLY when the buyer explicitly asks for that field
  to be mandatory / required. Never make a field mandatory on your own judgement.
- Do NOT touch anything the buyer didn't mention. If the instruction is unclear
  or doesn't map to an edit, return the document unchanged and say so in the
  summary.
- Never drop the per-line fixed response grid concept — commercialFields are
  ONLY quote-level fields (taxes, freight, payment terms, discounts, tooling,
  validity…), never unit price / currency / UoM / MOQ / lead time.
- Output valid JSON only, no prose, no code fence needed.`;
  }

  private buildUserMessage(input: RFQEditInput): string {
    let m = `RFQ id: ${input.rfqId}\nBuyer: ${input.buyerName}\n\n`;

    const recent = input.thread.slice(-6);
    if (recent.length) {
      m += `## Recent conversation (oldest first, for context)\n`;
      recent.forEach((e) => {
        if (e.kind === 'attachment') {
          m += `[${e.role} attached: ${e.attachmentName ?? 'document'}]\n`;
        } else {
          m += `${e.role}: ${e.content}\n`;
        }
      });
      m += `\n`;
    }

    m += `## Current RFQ document\n`;
    m += '```json\n' + JSON.stringify(input.doc, null, 2) + '\n```\n\n';

    m += `## For reference, the document reads as:\n`;
    m += rfqDocumentToText(input.doc) + '\n\n';

    m += `## Buyer's instruction\n${input.instruction}\n\n`;
    m += `Apply it and return the updated document JSON + summary now.`;
    return m;
  }
}
