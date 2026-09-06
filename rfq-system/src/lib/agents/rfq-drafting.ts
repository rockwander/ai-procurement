import { BaseAgent, AgentResponse } from './base';

export interface RFQDraftInput {
  businessRequirements: string;
  policyDocuments: Array<{
    title: string;
    content: string;
    category: string;
  }>;
  itemCategory?: string;
  deadline?: string;
}

export interface RFQDraftOutput {
  title: string;
  description: string;
  requirements: string[];
  specifications: Record<string, any>;
  lineItems: Array<{
    itemDescription: string;
    quantity: number;
    unit: string;
    specifications: Record<string, any>;
  }>;
  termsAndConditions: string[];
  evaluationCriteria: string[];
}

export class RFQDraftingAgent extends BaseAgent {
  async draftRFQ(input: RFQDraftInput, rfqId?: string): Promise<AgentResponse<RFQDraftOutput>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(input);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseJsonResponse<RFQDraftOutput>(text);

      // Calculate cost
      const costUsd = this.calculateCost(tokensUsed);

      // Log execution
      await this.logExecution({
        agentType: 'drafting',
        rfqId,
        inputData: input,
        outputData: data,
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(`✅ RFQ drafted successfully (${tokensUsed} tokens, $${costUsd.toFixed(4)})`);

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
        agentType: 'drafting',
        rfqId,
        inputData: input,
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ RFQ drafting failed:', error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert procurement specialist helping to draft Request for Quotation (RFQ) documents.

Your role is to:
1. Analyze business requirements and translate them into clear, structured RFQ documents
2. Ensure compliance with company procurement policies
3. Generate detailed specifications and evaluation criteria
4. Create well-structured line items for quotation

Output Format:
Return a JSON object with this structure:
{
  "title": "Clear, descriptive RFQ title",
  "description": "Comprehensive overview of the procurement need",
  "requirements": ["List of general requirements"],
  "specifications": {"key": "Technical specifications as object"},
  "lineItems": [
    {
      "itemDescription": "Description",
      "quantity": number,
      "unit": "unit of measurement",
      "specifications": {"key": "Item-specific specs"}
    }
  ],
  "termsAndConditions": ["List of terms"],
  "evaluationCriteria": ["How quotes will be evaluated"]
}

Important:
- Be specific and unambiguous
- Include all policy requirements
- Use professional procurement language
- Ensure compliance with provided policies`;
  }

  private buildUserMessage(input: RFQDraftInput): string {
    let message = `Draft an RFQ document based on the following information:\n\n`;

    message += `## Business Requirements:\n${input.businessRequirements}\n\n`;

    if (input.itemCategory) {
      message += `## Item Category:\n${input.itemCategory}\n\n`;
    }

    if (input.deadline) {
      message += `## Deadline:\n${input.deadline}\n\n`;
    }

    if (input.policyDocuments.length > 0) {
      message += `## Company Policies (must be followed):\n\n`;
      input.policyDocuments.forEach((policy) => {
        message += `### ${policy.title} (${policy.category})\n${policy.content}\n\n`;
      });
    }

    message += `\nPlease generate a comprehensive RFQ document that addresses all requirements and complies with all policies. Return the result as a JSON object.`;

    return message;
  }
}
