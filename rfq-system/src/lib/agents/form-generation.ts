import { BaseAgent, AgentResponse } from './base';

export interface FormField {
  id: string;
  type: 'text' | 'number' | 'email' | 'tel' | 'textarea' | 'select' | 'date' | 'file';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // for select fields
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  orderIndex: number;
  section?: string;
}

export interface FormSchema {
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    orderIndex: number;
  }>;
  fields: FormField[];
}

export class FormGenerationAgent extends BaseAgent {
  async generateForm(rfqContent: string, lineItems: any[], rfqId?: string): Promise<AgentResponse<FormSchema>> {
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(rfqContent, lineItems);

      const { text, tokensUsed } = await this.callGemini(userMessage, {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      });

      const durationMs = Date.now() - startTime;
      const data = this.parseJsonResponse<FormSchema>(text);

      // Validate and fix form schema
      data.fields = data.fields.map((field, index) => ({
        ...field,
        id: field.id || `field_${index}`,
        orderIndex: field.orderIndex ?? index,
      }));

      const costUsd = this.calculateCost(tokensUsed);

      await this.logExecution({
        agentType: 'form_generation',
        rfqId,
        inputData: { rfqContent, lineItems },
        outputData: data,
        modelUsed: this.model,
        tokensUsed,
        costUsd,
        durationMs,
        success: true,
      });

      console.log(`✅ Form generated successfully (${tokensUsed} tokens, $${costUsd.toFixed(4)})`);

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
        agentType: 'form_generation',
        rfqId,
        modelUsed: this.model,
        durationMs,
        success: false,
        errorMessage,
      });

      console.error('❌ Form generation failed:', error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are a form builder specialist that converts RFQ requirements into structured quote submission forms.

Your task is to analyze an RFQ document and create a JSON form schema that suppliers will use to submit their quotes.

Form Schema Structure:
{
  "sections": [
    {
      "id": "unique_section_id",
      "title": "Section Title",
      "description": "Optional section description",
      "orderIndex": 0
    }
  ],
  "fields": [
    {
      "id": "unique_field_id",
      "type": "text|number|email|tel|textarea|select|date|file",
      "label": "Field Label",
      "placeholder": "Optional placeholder",
      "required": true|false,
      "options": ["option1", "option2"], // only for select type
      "validation": {
        "min": 0,
        "max": 1000,
        "pattern": "regex pattern"
      },
      "orderIndex": 0,
      "section": "section_id"
    }
  ]
}

Guidelines:
1. Create logical sections (Company Info, Line Items, Pricing, Terms, etc.)
2. Include fields for all RFQ line items with quantity and unit price
3. Add standard fields: company name, contact info, delivery timeline
4. Make critical fields required
5. Use appropriate field types (number for prices, date for delivery, etc.)
6. Add validation rules where appropriate
7. Use clear, professional labels

Return only the JSON schema, no additional text.`;
  }

  private buildUserMessage(rfqContent: string, lineItems: any[]): string {
    let message = `Generate a quote submission form for the following RFQ:\n\n`;

    message += `## RFQ Content:\n${rfqContent}\n\n`;

    if (lineItems.length > 0) {
      message += `## Line Items:\n`;
      lineItems.forEach((item, index) => {
        message += `${index + 1}. ${item.itemDescription} - Quantity: ${item.quantity} ${item.unit}\n`;
      });
      message += `\n`;
    }

    message += `Create a comprehensive form that allows suppliers to:\n`;
    message += `- Provide their company information\n`;
    message += `- Quote prices for each line item\n`;
    message += `- Specify delivery timelines\n`;
    message += `- Add notes and attachments\n`;
    message += `- Accept terms and conditions\n\n`;

    message += `Return the form schema as JSON.`;

    return message;
  }
}
