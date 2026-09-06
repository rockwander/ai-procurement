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
      quantity: number;
      unitPrice: number;
      totalPrice: number;
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

    message += `## RFQ Line Items:\n`;
    input.rfqLineItems.forEach((item, i) => {
      message += `${i + 1}. ${item.itemDescription} - Quantity: ${item.quantity}\n`;
    });
    message += `\n`;

    message += `## Supplier Quotes:\n\n`;
    input.quotes.forEach((quote, i) => {
      message += `### Quote ${i + 1}: ${quote.supplierName}\n`;
      message += `Total: $${quote.totalAmount.toFixed(2)}\n`;
      if (quote.deliveryDays) {
        message += `Delivery: ${quote.deliveryDays} days\n`;
      }
      message += `Line Items:\n`;
      quote.lineItems.forEach((item) => {
        message += `  - ${item.itemDescription}: ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${item.totalPrice.toFixed(2)}\n`;
      });
      if (quote.notes) {
        message += `Notes: ${quote.notes}\n`;
      }
      message += `\n`;
    });

    message += `\nApply the strategy and return the award decisions as JSON.`;

    return message;
  }

  private validateAwards(output: QuoteEvaluationOutput, input: QuoteEvaluationInput): void {
    // Check that all RFQ line items are awarded
    const awardedItemIds = new Set<string>();
    output.awards.forEach((award) => {
      award.lineItems.forEach((item) => {
        awardedItemIds.add(item.itemId);
      });
    });

    const requiredItemIds = new Set(input.rfqLineItems.map((item) => item.id));

    for (const itemId of requiredItemIds) {
      if (!awardedItemIds.has(itemId)) {
        throw new Error(`Line item ${itemId} was not awarded to any supplier`);
      }
    }

    // Recalculate total cost to verify
    const calculatedTotal = output.awards.reduce(
      (sum, award) => sum + award.totalAmount,
      0
    );

    if (Math.abs(calculatedTotal - output.totalCost) > 0.01) {
      console.warn(`Total cost mismatch: ${calculatedTotal} vs ${output.totalCost}`);
      output.totalCost = calculatedTotal; // Fix it
    }
  }
}
