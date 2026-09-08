import { BaseAgent, AgentResponse } from './base';
import {
  RFQDocument,
  normalizeRFQDocument,
  defaultCommercialFields,
  defaultTerms,
} from '@/lib/rfq-document';
import { buildOutline, type RFQOutline } from '@/lib/rfq-outline';

export interface RFQThreadEntry {
  role: 'user' | 'assistant';
  kind: 'message' | 'update' | 'attachment';
  content: string;
  attachmentName?: string;
}

export interface RFQDraftInput {
  /** The whole create-RFQ conversation so far, oldest first. */
  thread: RFQThreadEntry[];
  policyDocuments: Array<{ title: string; content: string; category: string }>;
  buyerName: string;
  rfqId: string;
  /** The current RFQ document, if a previous "update" already produced one. */
  currentDocument?: RFQDocument | null;
  /** Section headings the buyer chose to exclude — do not re-add these. */
  excludedSections?: string[];
}

export class RFQDraftingAgent extends BaseAgent {
  /**
   * Regenerate the structured RFQ document from the entire create-RFQ thread.
   * Called on an explicit "update"; considers every message, pasted content
   * and attached-document text in the thread.
   */
  async draftRFQ(
    input: RFQDraftInput,
    rfqId?: string
  ): Promise<AgentResponse<RFQDocument>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(input);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.6,
      });

      const durationMs = Date.now() - startTime;
      const parsed = this.parseJsonResponse<any>(text);
      const data = normalizeRFQDocument(parsed, {
        rfqId: input.rfqId,
        buyer: input.buyerName,
      });

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'drafting',
        rfqId: rfqId ?? input.rfqId,
        inputData: { threadLength: input.thread.length },
        outputData: { lineItems: data.lineItems.length, questions: data.questionnaire.length },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(
        `✅ RFQ document drafted (${data.lineItems.length} line items, ${tokensUsed} tokens, $${costUsd.toFixed(4)})`
      );

      return { success: true, data, tokensUsed, costUsd, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logExecution({
        agentType: 'drafting',
        rfqId: rfqId ?? input.rfqId,
        inputData: { threadLength: input.thread.length },
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ RFQ drafting failed:', error);
      return { success: false, error: errorMessage, durationMs };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert procurement specialist who drafts Request for Quotation (RFQ) documents.

You are given the full conversation a buyer has had while assembling an RFQ:
their instructions, pasted content, and the text of documents they attached
(business requirements, policies, spec sheets). Produce ONE structured RFQ
document that reflects everything in the thread and complies with any policies.

Return ONLY a JSON object with this exact shape:
{
  "header": {
    "buyer": "buyer / company name",
    "rfqId": "keep the id you are given",
    "quoteDeadline": "e.g. 15 Sep 2026",
    "expectedDelivery": "e.g. Monthly supply, starting Oct 2026",
    "currency": "e.g. INR",
    "validity": "e.g. Quote valid for 90 days"
  },
  "lineItems": [
    { "item": "Carton Box A", "specification": "5-ply, 12x10x8 in", "quantity": 10000, "unit": "pcs" }
  ],
  "commercialFields": [
    { "label": "Unit price", "type": "number", "required": true },
    { "label": "Lead time", "type": "text", "required": true }
  ],
  "questionnaire": [
    { "question": "Do you have ISO 9001 certification?", "responseType": "yesno", "required": true }
  ],
  "supportingDocsNote": "Upload certificates / relevant documents.",
  "termsAndConditions": ["Delivery location", "Payment terms", "..."]
}

Rules:
- lineItems: extract every distinct item the buyer wants quoted, with realistic
  quantities and units. Dozens of rows are fine.
- commercialFields: the fields a vendor must fill FOR EACH line item. Default to
  unit price, currency, unit of measurement, MOQ, lead time, applicable taxes,
  freight/transport charges, discount — adjust to the buyer's needs. Every entry
  MUST have a non-empty "label" (a short human field name); never emit a field
  with a blank label. For type "select", include an "options" array.
- questionnaire: quality / capability questions. Every entry MUST have a
  non-empty "question". responseType is "yesno", "text", or "file".
- termsAndConditions: a list of short strings.
- Do not invent facts the thread doesn't support; leave a header field as ""
  if unknown.
- Output valid JSON only, no prose, no code fence needed.`;
  }

  private buildUserMessage(input: RFQDraftInput): string {
    let m = `RFQ id: ${input.rfqId}\nBuyer: ${input.buyerName}\n\n`;

    if (input.currentDocument) {
      m += `## Current RFQ document (revise this based on the latest thread)\n`;
      m += '```json\n' + JSON.stringify(input.currentDocument, null, 2) + '\n```\n\n';
    }

    if (input.excludedSections && input.excludedSections.length > 0) {
      m += `## The buyer has explicitly chosen NOT to include these in the RFQ\n`;
      m += `Do not add them back, even if a policy or document suggests them:\n`;
      input.excludedSections.forEach((s) => (m += `- ${s}\n`));
      m += `\n`;
    }

    if (input.policyDocuments.length > 0) {
      m += `## Company policies (must be complied with)\n\n`;
      input.policyDocuments.forEach((p) => {
        m += `### ${p.title} (${p.category})\n${p.content}\n\n`;
      });
    }

    m += `## Conversation thread (oldest first)\n\n`;
    input.thread.forEach((e) => {
      if (e.kind === 'attachment') {
        m += `[${e.role} attached document: ${e.attachmentName ?? 'document'}]\n${e.content}\n\n`;
      } else if (e.kind === 'update') {
        m += `[${e.role} requested an update]\n`;
        if (e.content) m += `${e.content}\n`;
        m += `\n`;
      } else {
        m += `${e.role}: ${e.content}\n\n`;
      }
    });

    m += `\nGenerate the RFQ document JSON now.`;
    return m;
  }

  /**
   * The outline step: draft the full RFQ document from the thread, then derive
   * a reviewable outline of ticked sub-headings from it (no second AI call).
   * `prevOutline` carries the buyer's tick choices across a re-outline.
   */
  async draftOutline(
    input: RFQDraftInput,
    prevOutline?: RFQOutline | null,
    rfqId?: string
  ): Promise<AgentResponse<RFQOutline>> {
    const res = await this.draftRFQ(input, rfqId);
    if (!res.success || !res.data) {
      return { success: false, error: res.error, durationMs: res.durationMs };
    }
    return {
      success: true,
      data: buildOutline(res.data, prevOutline, input.excludedSections),
      tokensUsed: res.tokensUsed,
      costUsd: res.costUsd,
      durationMs: res.durationMs,
    };
  }

  /** Fallbacks re-exported for callers that need a starting document. */
  static defaults() {
    return { commercialFields: defaultCommercialFields(), terms: defaultTerms() };
  }
}
