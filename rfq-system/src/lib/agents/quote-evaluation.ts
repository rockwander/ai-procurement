import { BaseAgent, AgentResponse } from './base';

export interface QuoteEvaluationInput {
  strategy: string; // Natural language strategy
  quotes: Array<{
    submissionId: string;
    supplierId: string;
    supplierName: string;
    lineItems: Array<{
      itemId: string;
      itemDescription: string;
      quantity: number; // quantity this supplier can actually supply
      askedQuantity?: number;
      unitPrice: number; // normalised to the RFQ's asked unit
      totalPrice: number;
      currency?: string;
      currencyDiffersFromRfq?: boolean;
      uomAmbiguous?: boolean;
      partial?: boolean;
      leadTimeDays?: number;
    }>;
    totalAmount: number;
    deliveryDays?: number;
    notes?: string;
  }>;
  rfqLineItems: Array<{
    id: string;
    itemDescription: string;
    quantity: number;
  }>;
}

export interface Award {
  supplierId: string;
  supplierName: string;
  lineItems: Array<{
    itemId: string;
    itemDescription: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  totalAmount: number;
}

export interface QuoteEvaluationOutput {
  awards: Award[];
  reasoning: string;
  totalCost: number;
  savings?: number;
  warnings?: string[];
}

export class QuoteEvaluationAgent extends BaseAgent {
  async evaluateQuotes(
    input: QuoteEvaluationInput,
    rfqId?: string
  ): Promise<AgentResponse<QuoteEvaluationOutput>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(input);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.3, // Lower temperature for consistency
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseJsonResponse<QuoteEvaluationOutput>(text);

      // Validate awards
      this.validateAwards(data, input);

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'evaluation',
        rfqId,
        inputData: input,
        outputData: data,
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(`✅ Quotes evaluated successfully (${tokensUsed} tokens, $${costUsd.toFixed(4)})`);

      return {
        success: true,
        data,
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
        inputData: input,
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ Quote evaluation failed:', error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are a procurement strategist analyzing supplier quotes and applying award strategies.

Your task:
1. Analyze all supplier quotes
2. Apply the procurement strategy specified by the user
3. Award line items to suppliers according to the strategy
4. Provide clear reasoning for your decisions
5. Calculate total costs and potential savings

Common Strategies:
- **Lowest total cost**: Award all items to supplier with lowest total
- **Lowest unit price**: Award each item to supplier with lowest price for that item
- **Split award**: Distribute items across multiple suppliers for risk/capacity
- **Single-source**: Award everything to one preferred supplier
- **Quality-first**: Only consider suppliers meeting quality criteria
- **Weighted score**: Balance price, quality, delivery, service

Output Format (JSON):
{
  "awards": [
    {
      "supplierId": "id",
      "supplierName": "name",
      "lineItems": [
        {
          "itemId": "id",
          "itemDescription": "desc",
          "quantity": 10,
          "unitPrice": 100.00,
          "totalPrice": 1000.00
        }
      ],
      "totalAmount": 1000.00
    }
  ],
  "reasoning": "Detailed explanation of why this strategy was applied and results",
  "totalCost": 5000.00,
  "savings": 500.00,
  "warnings": ["Optional warnings like 'Supplier X has higher price but better delivery'"]
}

Important:
- Every RFQ line item MUST be awarded
- Calculations must be accurate
- Reasoning must be clear and professional
- Consider trade-offs (price vs quality/delivery)
- Flag any concerns or risks`;
  }

  private buildUserMessage(input: QuoteEvaluationInput): string {
    let message = `Apply the following procurement strategy to these quotes:\n\n`;

    message += `## Strategy:\n${input.strategy}\n\n`;

    message += `## RFQ Line Items (use these exact itemId values in your output):\n`;
    input.rfqLineItems.forEach((item, i) => {
      message += `${i + 1}. itemId="${item.id}" | ${item.itemDescription} | Quantity: ${item.quantity}\n`;
    });
    message += `\n`;

    message += `## Supplier Quotes:\n\n`;
    input.quotes.forEach((quote, i) => {
      message += `### Quote ${i + 1}: ${quote.supplierName} (supplierId="${quote.supplierId}")\n`;
      message += `Total: $${quote.totalAmount.toFixed(2)}\n`;
      if (quote.deliveryDays) {
        message += `Delivery: ${quote.deliveryDays} days\n`;
      }
      message += `Line Items (only lines this supplier can supply are listed; unit prices are normalised to the RFQ's asked unit):\n`;
      quote.lineItems.forEach((item) => {
        const flags: string[] = [];
        if (item.partial) {
          flags.push(
            `PARTIAL — can supply ${item.quantity} of ${item.askedQuantity ?? item.quantity} asked`
          );
        }
        if (item.currencyDiffersFromRfq) {
          flags.push(`quoted in ${item.currency} (NOT the RFQ currency — not FX-converted)`);
        }
        if (item.uomAmbiguous) flags.push('unit of measure ambiguous (pack size unknown)');
        if (item.leadTimeDays != null) flags.push(`lead time ${item.leadTimeDays}d`);
        message += `  - itemId="${item.itemId}" | ${item.itemDescription}: ${item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.totalPrice.toFixed(2)}`;
        if (flags.length) message += `  [${flags.join('; ')}]`;
        message += `\n`;
      });
      if (quote.notes) {
        message += `Notes: ${quote.notes}\n`;
      }
      message += `\n`;
    });

    message += `\nApply the strategy and return the award decisions as JSON. `;
    message += `A supplier can only be awarded a line it actually quoted (listed above). `;
    message += `If a supplier's quantity for a line is PARTIAL, you may split that line across suppliers to cover the full asked quantity. `;
    message += `Do not compare or add prices across different currencies — call out any line quoted in a non-RFQ currency in your reasoning. `;
    message += `Every RFQ line item (by its exact itemId) should be awarded (split allowed); if no supplier can cover a line, say so in warnings. `;
    message += `Use the exact supplierId and itemId strings given above.`;

    return message;
  }

  private validateAwards(output: QuoteEvaluationOutput, input: QuoteEvaluationInput): void {
    const validIds = new Set(input.rfqLineItems.map((li) => li.id));
    const byDescription = new Map(
      input.rfqLineItems.map((li) => [li.itemDescription.trim().toLowerCase(), li.id])
    );

    // Repair itemIds the model may have paraphrased: fall back to a description
    // match before giving up.
    for (const award of output.awards) {
      for (const item of award.lineItems) {
        if (!validIds.has(item.itemId)) {
          const repaired = byDescription.get(
            String(item.itemDescription || '').trim().toLowerCase()
          );
          if (repaired) item.itemId = repaired;
        }
      }
    }

    const awardedItemIds = new Set<string>();
    output.awards.forEach((award) =>
      award.lineItems.forEach((item) => awardedItemIds.add(item.itemId))
    );

    // A line can legitimately be unawardable now — no supplier quoted it, or
    // none could cover the quantity. Surface it as a warning, don't hard-fail.
    const quotableItemIds = new Set<string>();
    input.quotes.forEach((q) =>
      q.lineItems.forEach((li) => quotableItemIds.add(li.itemId))
    );
    const missing = input.rfqLineItems.filter((li) => !awardedItemIds.has(li.id));
    if (missing.length > 0) {
      const trulyUnquoted = missing.filter((li) => !quotableItemIds.has(li.id));
      const droppedButQuoted = missing.filter((li) => quotableItemIds.has(li.id));
      output.warnings = output.warnings ?? [];
      if (trulyUnquoted.length > 0) {
        output.warnings.push(
          `${trulyUnquoted.length} line item(s) had no valid supplier quote and could not be awarded: ` +
            trulyUnquoted.map((li) => li.itemDescription).join(', ') + '.'
        );
      }
      if (droppedButQuoted.length > 0) {
        output.warnings.push(
          `The strategy did not award ${droppedButQuoted.length} line item(s) that were quoted: ` +
            droppedButQuoted.map((li) => li.itemDescription).join(', ') +
            '. Rephrase the strategy if they should be included.'
        );
      }
    }

    // Recalculate totals from line items to guarantee consistency.
    for (const award of output.awards) {
      const sum = award.lineItems.reduce((s, li) => s + (li.totalPrice || 0), 0);
      if (Math.abs(sum - award.totalAmount) > 0.01) award.totalAmount = sum;
    }
    const calculatedTotal = output.awards.reduce((s, a) => s + a.totalAmount, 0);
    if (Math.abs(calculatedTotal - output.totalCost) > 0.01) {
      output.totalCost = calculatedTotal;
    }
  }
}
