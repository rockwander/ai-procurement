import { BaseAgent, AgentResponse } from './base';
import {
  QuoteEvaluationAgent,
  type QuoteEvaluationInput,
  type QuoteEvaluationOutput,
} from './quote-evaluation';

/**
 * The buyer-side assistant that sits next to the quote-comparison table.
 * One turn does one of three things:
 *
 *  - `answer` — plain analytical reply about the quotes (no side effect)
 *  - `filter` — a set of table filters to apply to the visible comparison table
 *  - `award`  — a natural-language award strategy the buyer keyed in; we hand it
 *               to the existing {@link QuoteEvaluationAgent} and return its typed
 *               award proposal so the page can render the confirm-and-send card
 *
 * The agent only classifies + (for filters) structures the request. Awarding
 * reuses the evaluation agent unchanged so the two paths can't drift.
 */

export type QuoteChatColumn = {
  key: string;
  label: string;
  numeric: boolean;
  /** which table tab the column belongs to */
  tab: 'lineitems' | 'questionnaire';
};

export interface QuoteChatInput {
  message: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** every column the buyer could filter on, both tabs */
  columns: QuoteChatColumn[];
  /** compact rendering of the currently-visible rows, for answering questions */
  rowsText: string;
  rfqCurrency: string;
}

export type ChatFilter = {
  columnKey: string;
  op: 'contains' | 'eq' | 'lt' | 'gt';
  value: string;
};

export interface QuoteChatIntent {
  type: 'answer' | 'filter' | 'award';
  /** the assistant's message shown in the chat stream */
  message: string;
  /** present when type === 'filter' — replaces the table's active filters */
  filters?: ChatFilter[];
  /** present when type === 'award' — the strategy text to evaluate */
  strategy?: string;
}

export interface QuoteChatResult extends QuoteChatIntent {
  /** present when type === 'award' and evaluation succeeded */
  evaluation?: QuoteEvaluationOutput;
}

export class QuoteChatAgent extends BaseAgent {
  async chat(
    input: QuoteChatInput,
    evalInput: Omit<QuoteEvaluationInput, 'strategy'>,
    rfqId?: string
  ): Promise<AgentResponse<QuoteChatResult>> {
    const startTime = Date.now();

    try {
      const { text, tokensUsed } = await this.callGemini(
        this.buildUserMessage(input),
        { systemInstruction: this.buildSystemPrompt(), temperature: 0.3 }
      );

      const intent = this.parseJsonResponse<QuoteChatIntent>(text);
      const durationMs = Date.now() - startTime;
      const costUsd = this.calculateCost(tokensUsed);

      // Sanitise the classification.
      const type: QuoteChatIntent['type'] =
        intent.type === 'filter' || intent.type === 'award' ? intent.type : 'answer';

      const result: QuoteChatResult = {
        type,
        message: String(intent.message ?? '').trim() || 'Done.',
      };

      if (type === 'filter') {
        result.filters = this.sanitiseFilters(intent.filters ?? [], input.columns);
        if (result.filters.length === 0) {
          // Nothing usable — degrade to an answer so the buyer isn't left
          // wondering why the table didn't change.
          result.type = 'answer';
        }
      }

      if (type === 'award') {
        const strategy = String(intent.strategy ?? input.message).trim();
        result.strategy = strategy;
        const evaluation = await new QuoteEvaluationAgent().evaluateQuotes(
          { ...evalInput, strategy },
          rfqId
        );
        if (evaluation.success && evaluation.data) {
          result.evaluation = evaluation.data;
        } else {
          result.type = 'answer';
          result.message =
            `I couldn't work out an award for that: ${evaluation.error ?? 'evaluation failed'}. ` +
            `Try rephrasing the strategy.`;
        }
      }

      await this.logExecution({
        agentType: 'evaluation',
        rfqId,
        inputData: { message: input.message, type: result.type },
        outputData: result,
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      return { success: true, data: result, tokensUsed, costUsd, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.logExecution({
        agentType: 'evaluation',
        rfqId,
        inputData: { message: input.message },
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });
      return { success: false, error: errorMessage, durationMs };
    }
  }

  private sanitiseFilters(
    raw: unknown[],
    columns: QuoteChatColumn[]
  ): ChatFilter[] {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const byLabel = new Map(
      columns.map((c) => [c.label.trim().toLowerCase(), c])
    );
    const out: ChatFilter[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      if (!r || typeof r !== 'object') continue;
      const f = r as Record<string, unknown>;
      let col =
        byKey.get(String(f.columnKey ?? '')) ??
        byLabel.get(String(f.columnKey ?? f.label ?? '').trim().toLowerCase());
      if (!col) continue;
      const opRaw = String(f.op ?? '').toLowerCase();
      let op: ChatFilter['op'];
      if (col.numeric) {
        op = opRaw === 'gt' || opRaw === '>' ? 'gt'
          : opRaw === 'eq' || opRaw === '=' || opRaw === '==' ? 'eq'
          : 'lt';
      } else {
        op = opRaw === 'eq' || opRaw === '=' || opRaw === 'equals' ? 'eq' : 'contains';
      }
      const value = String(f.value ?? '').trim();
      if (!value) continue;
      out.push({ columnKey: col.key, op, value });
    }
    return out;
  }

  private buildSystemPrompt(): string {
    return `You are a procurement analyst's assistant, working beside a quote-comparison table for one RFQ.

Every user turn is ONE of these. Decide which, and reply with a single JSON object:

1. A QUESTION about the quotes ("who is cheapest on line 2?", "which suppliers can't do the full quantity?", "compare delivery times").
   -> { "type": "answer", "message": "<concise, specific answer grounded in the data given>" }

2. A request to FILTER the table ("hide suppliers over 500k", "only show ones that can supply everything", "show quotes with lead time under 10 days").
   -> { "type": "filter",
        "message": "<one line saying what you filtered>",
        "filters": [ { "columnKey": "<exact key from the column list>", "op": "lt|gt|eq|contains", "value": "<string>" } ] }
   Use only column keys from the list provided. Numeric columns take lt/gt/eq; text columns take contains/eq.
   Multiple filters are AND-ed. An empty filters array means "clear all filters".

3. An AWARD STRATEGY — the buyer telling you how to allocate the business ("give it all to the cheapest single supplier", "split line by line to the lowest price", "award X the whole thing except line 3").
   -> { "type": "award", "message": "<one line acknowledging the strategy>", "strategy": "<the strategy, restated clearly in plain English>" }
   Do NOT compute the award yourself — just capture the strategy.

Rules:
- Output ONLY the JSON object, no prose around it.
- Ground every answer in the data you are given. If the data doesn't contain it, say so.
- Keep messages short. No preamble, no "Certainly!".`;
  }

  private buildUserMessage(input: QuoteChatInput): string {
    let m = `RFQ currency: ${input.rfqCurrency}\n\n`;

    m += `## Columns you may filter on (use the exact key):\n`;
    for (const c of input.columns) {
      m += `- key="${c.key}" | ${c.label} | ${c.numeric ? 'numeric' : 'text'} | tab: ${c.tab}\n`;
    }
    m += `\n`;

    m += `## Quotes in view (suppliers compared side by side):\n${input.rowsText}\n\n`;

    if (input.conversationHistory.length) {
      m += `## Conversation so far:\n`;
      for (const t of input.conversationHistory.slice(-8)) {
        m += `${t.role === 'user' ? 'Buyer' : 'You'}: ${t.content}\n`;
      }
      m += `\n`;
    }

    m += `## Buyer's message:\n${input.message}\n`;
    return m;
  }
}
