import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/db';
import { aiLogs } from '@/db/schema';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface AgentLogData {
  agentType: 'drafting' | 'form_generation' | 'supplier_filtering' | 'autofill' | 'evaluation';
  rfqId?: string;
  inputData?: any;
  outputData?: any;
  modelUsed: string;
  tokensUsed?: number;
  costUsd?: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

// Base agent class
export class BaseAgent {
  protected model = 'gemini-2.5-flash';

  // Call Gemini API with structured logging
  protected async callGemini(
    prompt: string,
    options?: {
      systemInstruction?: string;
      temperature?: number;
    }
  ): Promise<{ text: string; tokensUsed: number }> {
    const startTime = Date.now();

    try {
      const model = genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: options?.systemInstruction,
        generationConfig: {
          temperature: options?.temperature ?? 1.0,
        },
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      const durationMs = Date.now() - startTime;

      // Gemini doesn't return token counts in the same way
      // Estimate: ~4 chars per token
      const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);

      console.log(`✅ Gemini API call succeeded in ${durationMs}ms`);

      return {
        text,
        tokensUsed: estimatedTokens,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`❌ Gemini API call failed in ${durationMs}ms:`, error);
      throw error;
    }
  }

  // Calculate cost based on token usage (Gemini 2.5 Flash pricing)
  protected calculateCost(tokens: number): number {
    // Gemini 2.5 Flash pricing (free tier: generous limits)
    // Paid tier: $0.075 per 1M input tokens, $0.30 per 1M output tokens
    // Simplified: average $0.15 per 1M tokens
    const COST_PER_MILLION = 0.15;
    return (tokens / 1_000_000) * COST_PER_MILLION;
  }

  // Log AI execution to database
  protected async logExecution(data: AgentLogData): Promise<void> {
    try {
      await db.insert(aiLogs).values(data);
    } catch (error) {
      console.error('Failed to log AI execution:', error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  // Parse JSON from Gemini response
  protected parseJsonResponse<T>(text: string): T {
    // Try to find JSON in code blocks
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);

    const jsonText = jsonMatch ? jsonMatch[1] : text;

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse JSON from Gemini response:', text);
      throw new Error('Invalid JSON response from AI');
    }
  }
}
