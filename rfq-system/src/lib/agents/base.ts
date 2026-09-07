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
  protected model = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  // Call Gemini API with structured logging + retry on transient errors
  // (429 rate limit, 503 overload). Falls back to a secondary model on the
  // last attempt so a demo doesn't hard-fail on a capacity spike.
  protected async callGemini(
    prompt: string,
    options?: {
      systemInstruction?: string;
      temperature?: number;
    }
  ): Promise<{ text: string; tokensUsed: number }> {
    const startTime = Date.now();
    const maxAttempts = 4;
    const fallbackModel = process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.5-flash';

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const modelName =
        attempt === maxAttempts && this.model !== fallbackModel
          ? fallbackModel
          : this.model;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: options?.systemInstruction,
          generationConfig: {
            temperature: options?.temperature ?? 1.0,
          },
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
        console.log(
          `✅ Gemini (${modelName}) succeeded in ${Date.now() - startTime}ms (attempt ${attempt})`
        );
        return { text, tokensUsed: estimatedTokens };
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        const transient = /\b(429|503|500|overloaded|high demand|rate limit)\b/i.test(msg);
        console.error(
          `❌ Gemini (${modelName}) failed attempt ${attempt}/${maxAttempts}: ${msg}`
        );
        if (!transient || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
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
