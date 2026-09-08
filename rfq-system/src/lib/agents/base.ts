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

  /**
   * The model chain: the agent's primary model, then the configured fallbacks.
   * Each is tried with a couple of retries for transient errors (429/503/500);
   * a non-transient error (e.g. 404 model-not-available) rolls straight to the
   * next model. Override the chain with GEMINI_MODEL_FALLBACK (comma-separated).
   */
  protected get modelChain(): string[] {
    const fallbacks = (
      process.env.GEMINI_MODEL_FALLBACK || 'gemini-flash-lite-latest,gemini-3-flash-preview'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [this.model, ...fallbacks.filter((m) => m !== this.model)];
  }

  protected async callGemini(
    prompt: string,
    options?: {
      systemInstruction?: string;
      temperature?: number;
    }
  ): Promise<{ text: string; tokensUsed: number }> {
    const startTime = Date.now();
    const retriesPerModel = 2;
    let lastError: unknown;

    for (const modelName of this.modelChain) {
      for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: options?.systemInstruction,
            generationConfig: { temperature: options?.temperature ?? 1.0 },
          });

          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);
          console.log(
            `✅ Gemini (${modelName}) succeeded in ${Date.now() - startTime}ms`
          );
          return { text, tokensUsed: estimatedTokens };
        } catch (error) {
          lastError = error;
          const msg = error instanceof Error ? error.message : String(error);
          const transient = /\b(429|500|502|503|504|overloaded|high demand|rate limit|unavailable)\b/i.test(msg);
          console.error(
            `❌ Gemini (${modelName}) attempt ${attempt}/${retriesPerModel}: ${msg}`
          );
          if (!transient) break; // non-transient → next model, no more retries here
          if (attempt < retriesPerModel) {
            await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
          }
          // transient + out of retries → fall through to next model
        }
      }
    }
    throw lastError;
  }

  // Rough cost estimate. We don't split input/output tokens, so this uses a
  // blended per-token rate in the Gemini Flash range (~$0.15 / 1M). Indicative
  // only — the free tier is $0.
  protected calculateCost(tokens: number): number {
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
