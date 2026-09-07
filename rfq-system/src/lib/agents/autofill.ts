import { BaseAgent, AgentResponse } from './base';
import type { FormSchema, FormField } from '@/lib/form-schema';

export interface AutofillLineItem {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

export interface AutofillInput {
  documentTexts: string[]; // Extracted text from any documents / pasted content the supplier provided
  formSchema: FormSchema;
  lineItems: AutofillLineItem[];
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AutofillOutput {
  // targetId -> raw extracted answer. targetId is a form field id OR
  // "lineitem:<rfqLineItemId>" for a per-line unit price.
  extractedData: Record<string, string | number>;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
  suggestions: string[];
  missingFields: string[];
}

const DOC_CHAR_CAP = 20_000;

export class AutofillAgent extends BaseAgent {
  async extractFormData(
    input: AutofillInput,
    rfqInvitationId?: string
  ): Promise<AgentResponse<AutofillOutput>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(input);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseJsonResponse<AutofillOutput>(text);
      data.extractedData = data.extractedData ?? {};
      data.confidence = data.confidence ?? {};
      data.suggestions = data.suggestions ?? [];
      data.missingFields = data.missingFields ?? [];

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'autofill',
        rfqId: rfqInvitationId,
        inputData: { documentCount: input.documentTexts.length, lineItems: input.lineItems.length },
        outputData: { fieldsExtracted: Object.keys(data.extractedData).length },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(
        `✅ Autofill completed (${Object.keys(data.extractedData).length} targets, $${costUsd.toFixed(4)})`
      );

      return { success: true, data, tokensUsed, costUsd, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logExecution({
        agentType: 'autofill',
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ Autofill failed:', error);
      return { success: false, error: errorMessage, durationMs };
    }
  }

  async chatResponse(
    userMessage: string,
    context: {
      formSchema: FormSchema;
      lineItems: AutofillLineItem[];
      currentFormData: Record<string, unknown>;
      currentLinePrices?: Record<string, number>;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<AgentResponse<{ message: string; suggestedUpdates?: Record<string, string | number> }>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildChatSystemPrompt(context);

      let conversationPrompt = '';
      if (context.conversationHistory.length > 0) {
        conversationPrompt = 'Previous conversation:\n';
        context.conversationHistory.forEach((msg) => {
          conversationPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
        });
        conversationPrompt += '\n';
      }
      conversationPrompt += `User: ${userMessage}`;

      const { text, tokensUsed } = await this.callGemini(conversationPrompt, {
        systemInstruction: systemPrompt,
        temperature: 0.6,
      });

      let suggestedUpdates: Record<string, string | number> | undefined;
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          suggestedUpdates = JSON.parse(jsonMatch[1]);
        } catch {
          /* ignore */
        }
      }

      const costUsd = this.calculateCost(tokensUsed);

      return {
        success: true,
        data: {
          message: text.replace(/```json[\s\S]*?```/g, '').trim(),
          suggestedUpdates,
        },
        tokensUsed,
        costUsd,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Chat response failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------

  private buildSystemPrompt(): string {
    return `You extract data from a supplier's own documents (quotations, price lists, spec
sheets, certificates, company profiles - in any layout) and map it onto a FIXED
quote form. You cannot change the form. Your job is to decide what in the
documents answers each form target, and return a value that fits that target's
type.

Return ONLY a JSON object:
{
  "extractedData": { "<targetId>": <value>, ... },
  "confidence":    { "<targetId>": "high" | "medium" | "low", ... },
  "suggestions":   [ "short notes for the supplier", ... ],
  "missingFields": [ "<label of a target you found no data for>", ... ]
}

Target ids:
- Form fields are given with their id, label, type and (for dropdowns) allowed
  options.
- Each RFQ line item is a target with id "lineitem:<id>" - the value is that
  item's unit price as a plain number.

Rules for values, by field type:
- number: return a plain number only (no currency, no units, no commas, no
  ranges). "INR 5,000" -> 5000. "90 days" -> 90. "8-12%" -> 10 (midpoint).
- select: return EXACTLY one of the allowed options. For a Yes/No question,
  return "Yes" or "No" based on the document, even if the document gives a long
  explanation - put the explanation in "suggestions" instead.
- text / textarea: return the relevant snippet, trimmed.
- date: return ISO yyyy-mm-dd if you can.
- lineitem:*: plain number (unit price). If a document gives pricing per item,
  fill every line you can.

General:
- Only include a target in extractedData if the documents actually support a
  value. Do not guess. If unsure, lower the confidence or leave it out and add
  the label to missingFields.
- "TBD", "to be confirmed", "not stated" in a document = no value; leave it out
  and list it in missingFields.
- Prefer explicit numbers/statements over inference.`;
  }

  private buildUserMessage(input: AutofillInput): string {
    let m = `## Quote form targets\n\n### Form fields\n`;
    for (const f of input.formSchema.fields ?? []) {
      m += this.describeField(f);
    }

    m += `\n### Line item unit prices (target id in brackets)\n`;
    if (input.lineItems.length === 0) {
      m += `(none)\n`;
    } else {
      for (const li of input.lineItems) {
        m += `- [lineitem:${li.id}] ${li.itemDescription} - ask qty ${li.quantity} ${li.unit}\n`;
      }
    }

    m += `\n## Supplier documents / provided content\n\n`;
    input.documentTexts.forEach((text, i) => {
      const clipped = text.length > DOC_CHAR_CAP ? text.slice(0, DOC_CHAR_CAP) + '\n…[truncated]' : text;
      m += `### Document ${i + 1}\n${clipped}\n\n`;
    });

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      m += `\n## Conversation so far\n`;
      input.conversationHistory.slice(-6).forEach((msg) => {
        m += `${msg.role}: ${msg.content}\n`;
      });
    }

    m += `\nReturn the JSON now.`;
    return m;
  }

  private describeField(f: FormField): string {
    const req = f.required ? ' (required)' : '';
    let line = `- [${f.id}] "${f.label}" - type ${f.type}${req}`;
    if (f.type === 'select' && f.options?.length) {
      line += ` - options: ${f.options.map((o) => `"${o}"`).join(', ')}`;
    }
    if (f.type === 'number' && f.validation) {
      const { min, max } = f.validation;
      if (min != null || max != null) line += ` - range ${min ?? '-'}..${max ?? '-'}`;
    }
    return line + `\n`;
  }

  private buildChatSystemPrompt(context: {
    formSchema: FormSchema;
    lineItems: AutofillLineItem[];
    currentFormData: Record<string, unknown>;
    currentLinePrices?: Record<string, number>;
  }): string {
    const fields = (context.formSchema.fields ?? [])
      .map((f) => this.describeField(f).trimEnd())
      .join('\n');
    const lines = context.lineItems
      .map(
        (li) =>
          `- [lineitem:${li.id}] ${li.itemDescription} (qty ${li.quantity} ${li.unit})` +
          (context.currentLinePrices?.[li.id] ? ` - currently ${context.currentLinePrices[li.id]}` : '')
      )
      .join('\n');

    return `You are helping a supplier complete a FIXED RFQ quote form. You cannot change
the form.

Form fields:
${fields || '(none)'}

Line item unit price targets:
${lines || '(none)'}

Current form values:
${JSON.stringify(context.currentFormData, null, 2)}

Your role:
- Answer the supplier's questions about the form.
- When they give you information (typed or pasted), work out which target it
  fills and propose an update.
- Keep proposed values in the same shape rules as extraction: numbers are plain
  numbers; select fields use exactly one allowed option; line prices are plain
  numbers under "lineitem:<id>".

If you propose updates, include them as a JSON code block:
\`\`\`json
{ "<targetId>": <value> }
\`\`\``;
  }
}
