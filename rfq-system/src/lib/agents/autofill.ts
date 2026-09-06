import { BaseAgent, AgentResponse } from './base';

export interface AutofillInput {
  documentTexts: string[]; // Extracted text from uploaded documents
  formSchema: any; // The form structure
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AutofillOutput {
  extractedData: Record<string, any>;
  confidence: Record<string, 'high' | 'medium' | 'low'>;
  suggestions: string[];
  missingFields: string[];
}

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
        temperature: 0.5,
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseJsonResponse<AutofillOutput>(text);

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'autofill',
        inputData: { documentCount: input.documentTexts.length },
        outputData: { fieldsExtracted: Object.keys(data.extractedData).length },
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(`✅ Autofill completed (${Object.keys(data.extractedData).length} fields, $${costUsd.toFixed(4)})`);

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
        agentType: 'autofill',
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ Autofill failed:', error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  async chatResponse(
    userMessage: string,
    context: {
      formSchema: any;
      currentFormData: Record<string, any>;
      conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<AgentResponse<{ message: string; suggestedUpdates?: Record<string, any> }>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildChatSystemPrompt(context);

      // Build conversation history as part of the prompt
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
        temperature: 0.7,
      });

      // Try to extract JSON suggestions if present
      let suggestedUpdates: Record<string, any> | undefined;
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          suggestedUpdates = JSON.parse(jsonMatch[1]);
        } catch {
          // Ignore JSON parse errors in chat
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

  private buildSystemPrompt(): string {
    return `You are an AI assistant helping suppliers fill out RFQ quote forms by extracting data from their documents.

Your task:
1. Read the provided documents (company profiles, price lists, certifications, etc.)
2. Extract relevant information that matches the form fields
3. Assign confidence levels to extracted data
4. Identify missing required information

Output Format (JSON):
{
  "extractedData": {
    "fieldId": "extracted value",
    "companyName": "Acme Corp",
    "unitPrice_item1": 99.99
  },
  "confidence": {
    "fieldId": "high|medium|low"
  },
  "suggestions": [
    "Found pricing for 5 out of 8 items",
    "Company certification document included"
  ],
  "missingFields": ["delivery_date", "warranty_terms"]
}

Guidelines:
- Extract exact values when found
- Don't guess or make up data
- Use "high" confidence only when explicitly stated
- Use "medium" when inferred from context
- Use "low" when uncertain
- List all required fields that couldn't be filled`;
  }

  private buildUserMessage(input: AutofillInput): string {
    let message = `Extract data from these supplier documents to fill the quote form:\n\n`;

    message += `## Form Fields to Fill:\n`;
    if (input.formSchema.fields) {
      input.formSchema.fields.forEach((field: any) => {
        const required = field.required ? ' (required)' : '';
        message += `- ${field.id}: ${field.label}${required}\n`;
      });
    }
    message += `\n`;

    message += `## Supplier Documents:\n\n`;
    input.documentTexts.forEach((text, i) => {
      message += `### Document ${i + 1}:\n${text.substring(0, 3000)}\n\n`;
    });

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      message += `\n## Previous Conversation:\n`;
      input.conversationHistory.slice(-4).forEach((msg) => {
        message += `${msg.role}: ${msg.content}\n`;
      });
    }

    message += `\nExtract and return data as JSON.`;

    return message;
  }

  private buildChatSystemPrompt(context: any): string {
    return `You are an AI assistant helping a supplier fill out an RFQ quote form.

Current form state:
${JSON.stringify(context.currentFormData, null, 2)}

Your role:
- Answer questions about the form
- Help find and fill missing information
- Suggest data based on documents they've uploaded
- Explain what information is needed
- Be helpful and conversational

If you suggest form updates, include them as JSON code block:
\`\`\`json
{
  "fieldId": "new value"
}
\`\`\``;
  }
}
