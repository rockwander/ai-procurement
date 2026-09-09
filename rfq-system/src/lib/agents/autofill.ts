import { BaseAgent, AgentResponse } from './base';
import type { FormSchema, FormField } from '@/lib/form-schema';
import { QUOTE_UOM_OPTIONS } from '@/lib/line-response';
import { LINE_FIELD_META, LINE_FIELDS, type LineField } from '@/lib/line-response-status';

export interface AutofillLineItem {
  id: string;
  itemDescription: string;
  quantity: number;
  unit: string;
}

export type Confidence = 'high' | 'medium' | 'low';

/**
 * One value the agent produced for a target, with why. `targetId` is:
 *   - a form field id (quote-level commercial / questionnaire), or
 *   - `line:<rfqLineItemId>:<field>` where <field> is one of the fixed per-line
 *     response fields (unitPrice, currency, quotedUom, canSupply, availableQty,
 *     leadTimeDays, moq).
 */
export interface AutofillPatch {
  value: string | number;
  confidence: Confidence;
  /** one short sentence: where this came from / why this value */
  rationale: string;
}

export interface AutofillOutput {
  patches: Record<string, AutofillPatch>;
  /** labels of mandatory-ish targets the documents said nothing about */
  missingFields: string[];
  /** short free-form notes for the supplier (caveats, things to double-check) */
  suggestions: string[];
}

export interface AutofillInput {
  documentTexts: string[];
  formSchema: FormSchema;
  lineItems: AutofillLineItem[];
  rfqCurrency: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /**
   * When set, the supplier is clarifying ONE specific field — a
   * `line:<id>:<field>` id or a form field id. The agent should focus its
   * answer on that target (and anything it can now resolve as a direct
   * consequence), not rescan everything.
   */
  activeField?: string;
}

const DOC_CHAR_CAP = 20_000;

export class AutofillAgent extends BaseAgent {
  async extractFormData(
    input: AutofillInput,
    rfqInvitationId?: string
  ): Promise<AgentResponse<AutofillOutput>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt(input);
      const userMessage = this.buildUserMessage(input);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseAutofillResponse(text);

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'autofill',
        rfqId: rfqInvitationId,
        inputData: {
          documentCount: input.documentTexts.length,
          lineItems: input.lineItems.length,
          activeField: input.activeField ?? null,
        },
        outputData: { patches: Object.keys(data.patches).length },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(
        `✅ Autofill completed (${Object.keys(data.patches).length} patches, $${costUsd.toFixed(4)})`
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

  /**
   * Conversational turn: the supplier asked a question or gave information in
   * chat (optionally scoped to `activeField`). Returns a short reply plus any
   * patches the message implies.
   */
  async chatResponse(
    userMessage: string,
    input: AutofillInput
  ): Promise<AgentResponse<{ message: string; patches: Record<string, AutofillPatch> }>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt(input, { conversational: true });

      let prompt = '';
      const history = input.conversationHistory ?? [];
      if (history.length > 0) {
        prompt += 'Conversation so far:\n';
        history.slice(-8).forEach((m) => {
          prompt += `${m.role === 'user' ? 'Supplier' : 'You'}: ${m.content}\n`;
        });
        prompt += '\n';
      }
      prompt += this.buildTargetsBlock(input);
      if (input.documentTexts.length) {
        prompt += `\n## Documents the supplier just provided\n\n`;
        input.documentTexts.forEach((t, i) => {
          prompt += `### Document ${i + 1}\n${this.clip(t)}\n\n`;
        });
      }
      prompt += `\n## Supplier's message\n${userMessage}\n\nReply, then give the JSON.`;

      const { text, tokensUsed } = await this.callGemini(prompt, {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      });

      const parsed = this.parseAutofillResponse(text);
      const message = text.replace(/```json[\s\S]*?```/g, '').trim();
      const costUsd = this.calculateCost(tokensUsed);

      return {
        success: true,
        data: { message, patches: parsed.patches },
        tokensUsed,
        costUsd,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('❌ Autofill chat failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  // -------------------------------------------------------------------------

  private parseAutofillResponse(text: string): AutofillOutput {
    const raw = this.parseJsonResponse<any>(text);
    const out: AutofillOutput = { patches: {}, missingFields: [], suggestions: [] };
    const src = raw?.patches ?? raw?.extractedData ?? {};
    for (const [id, v] of Object.entries(src as Record<string, any>)) {
      if (v == null) continue;
      if (typeof v === 'object' && 'value' in v) {
        const conf = ['high', 'medium', 'low'].includes(v.confidence)
          ? (v.confidence as Confidence)
          : 'medium';
        out.patches[id] = {
          value: v.value,
          confidence: conf,
          rationale: String(v.rationale ?? '').trim(),
        };
      } else {
        // tolerate a bare value
        out.patches[id] = { value: v, confidence: 'medium', rationale: '' };
      }
    }
    out.missingFields = Array.isArray(raw?.missingFields) ? raw.missingFields.map(String) : [];
    out.suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions.map(String) : [];
    return out;
  }

  private clip(t: string): string {
    return t.length > DOC_CHAR_CAP ? t.slice(0, DOC_CHAR_CAP) + '\n…[truncated]' : t;
  }

  private buildSystemPrompt(
    input: AutofillInput,
    opts: { conversational?: boolean } = {}
  ): string {
    const scope = input.activeField
      ? `\nThe supplier is clarifying ONE field: "${input.activeField}". Focus on that
target and anything you can now resolve as a direct consequence. Do not rescan
unrelated fields.\n`
      : '';

    const role = opts.conversational
      ? `You help a supplier put together their quotation for an RFQ. Answer their
question in 1-3 short sentences, then output the JSON patch block.`
      : `You read a supplier's own documents (quotations, price lists, spec sheets,
emails, rate cards - any layout) and map what they say onto a FIXED quote
structure. You cannot change the structure.`;

    return `${role}
${scope}
Return the data as a JSON object (in a \`\`\`json code block if you also wrote prose):
{
  "patches": {
    "<targetId>": { "value": <value>, "confidence": "high"|"medium"|"low", "rationale": "<one short sentence>" }
  },
  "missingFields": [ "<label of a mandatory target the documents/chat did not answer>" ],
  "suggestions":   [ "<short caveat worth showing the supplier>" ]
}

Target ids:
- Quote-level fields: use the id given in [brackets].
- Per line item, seven fixed fields, id "line:<lineId>:<field>":
${LINE_FIELDS.map((f) => `    line:<id>:${f}  — ${LINE_FIELD_META[f].label}`).join('\n')}

Value rules:
- "line:<id>:unitPrice": plain number, per the unit the supplier actually quoted.
  No currency symbol, no commas. "INR 1,240 / 100 pcs" -> value 1240 with
  "line:<id>:quotedUom" = "per 100".
- "line:<id>:currency": an ISO-ish code ("INR", "USD", "EUR"). Only emit it when
  the document shows a currency DIFFERENT from the RFQ currency
  (${input.rfqCurrency}); otherwise leave it - the system defaults it.
- "line:<id>:quotedUom": one of ${QUOTE_UOM_OPTIONS.map((o) => `"${o}"`).join(', ')}.
  Only emit when the document states a unit different from the line's asked unit.
- "line:<id>:canSupply": "full" | "partial" | "no". "no" when the supplier says
  they don't quote / can't make that item; "partial" when they can supply less
  than the asked quantity (also set availableQty).
- "line:<id>:availableQty": plain number - only when it is LESS than the asked qty.
- "line:<id>:leadTimeDays", "line:<id>:moq": plain numbers.
- Yes/No questionnaire fields: exactly "Yes" or "No"; put any explanation in
  suggestions.
- text fields: the relevant trimmed snippet.

confidence:
- "high": the document states it explicitly and unambiguously.
- "medium": stated but needs interpretation, or implied strongly.
- "low": inferred / assumed from indirect wording ("same as last year", a
  footnote, a range you took the midpoint of).

rationale: one short sentence a buyer would accept, e.g.
"Stated on line 3 of the price list" or
"Inferred 38 from 'rest same as last year' + the previous quote".

General:
- Never invent a value the documents / chat do not support. If a mandatory
  target has no support, leave it out and add its label to missingFields.
- "TBD" / "to be confirmed" / "not stated" = no value.`;
  }

  private buildTargetsBlock(input: AutofillInput): string {
    let m = `## Quote-level fields\n`;
    const fields = input.formSchema.fields ?? [];
    if (fields.length === 0) m += `(none)\n`;
    for (const f of fields) m += this.describeField(f);

    m += `\n## Line items (RFQ currency: ${input.rfqCurrency})\n`;
    if (input.lineItems.length === 0) {
      m += `(none)\n`;
    } else {
      for (const li of input.lineItems) {
        m += `- lineId "${li.id}": ${li.itemDescription} — asked ${li.quantity} ${li.unit}\n`;
      }
    }
    return m;
  }

  private buildUserMessage(input: AutofillInput): string {
    let m = this.buildTargetsBlock(input);

    m += `\n## Supplier documents / provided content\n\n`;
    input.documentTexts.forEach((text, i) => {
      m += `### Document ${i + 1}\n${this.clip(text)}\n\n`;
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
    let line = `- [${f.id}] "${f.label}" — type ${f.type}${req}`;
    if (f.type === 'select' && f.options?.length) {
      line += ` — options: ${f.options.map((o) => `"${o}"`).join(', ')}`;
    }
    return line + `\n`;
  }
}
