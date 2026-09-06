import { BaseAgent, AgentResponse } from './base';
import { db } from '@/db';
import { suppliers } from '@/db/schema';
import { sql, or, like } from 'drizzle-orm';

export interface SupplierFilterInput {
  categories: string[];
  minRating?: number;
  excludeFlags?: string[];
}

export interface RankedSupplier {
  id: string;
  companyName: string;
  contactEmail: string;
  rating: number;
  matchScore: number;
  aiSummary: string;
  pastOrdersCount: number;
  flags: string[];
  categories: string[];
}

export class SupplierFilteringAgent extends BaseAgent {
  // Use Haiku for cost efficiency on simple tasks
  protected model = 'claude-3-haiku-20240307';

  async filterAndRankSuppliers(
    input: SupplierFilterInput,
    rfqId?: string
  ): Promise<AgentResponse<RankedSupplier[]>> {
    const startTime = Date.now();

    try {
      // Step 1: SQL-based filtering (deterministic, fast, free)
      const matchedSuppliers = await this.sqlFilter(input);

      if (matchedSuppliers.length === 0) {
        return {
          success: true,
          data: [],
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: AI-based ranking and summarization (only for matched suppliers)
      const ranked = await this.aiRank(matchedSuppliers, input);

      const durationMs = Date.now() - startTime;

      console.log(`✅ Filtered ${matchedSuppliers.length} suppliers, ranked with AI`);

      return {
        success: true,
        data: ranked.data || [],
        tokensUsed: ranked.tokensUsed,
        costUsd: ranked.costUsd,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('❌ Supplier filtering failed:', error);

      return {
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }

  private async sqlFilter(input: SupplierFilterInput): Promise<any[]> {
    // Build category filters
    const categoryFilters = input.categories.map((cat) =>
      sql`json_array_length(json_extract(${suppliers.categories}, '$')) > 0 AND EXISTS (
        SELECT 1 FROM json_each(${suppliers.categories})
        WHERE json_each.value LIKE ${'%' + cat + '%'}
      )`
    );

    let query = db
      .select()
      .from(suppliers)
      .where(sql`${suppliers.isActive} = 1`);

    // Apply category filter if provided
    if (categoryFilters.length > 0) {
      query = query.where(or(...categoryFilters));
    }

    // Apply rating filter
    if (input.minRating) {
      query = query.where(sql`${suppliers.rating} >= ${input.minRating}`);
    }

    const results = await query;

    // Filter out suppliers with excluded flags
    if (input.excludeFlags && input.excludeFlags.length > 0) {
      return results.filter((supplier) => {
        const flags = (supplier.flags as string[]) || [];
        return !input.excludeFlags!.some((flag) => flags.includes(flag));
      });
    }

    return results;
  }

  private async aiRank(
    suppliers: any[],
    input: SupplierFilterInput
  ): Promise<AgentResponse<RankedSupplier[]>> {
    const systemPrompt = `You are a procurement analyst ranking suppliers based on their fit for an RFQ.

For each supplier, provide:
1. A match score (0-100) based on categories, rating, and past performance
2. A brief summary (1-2 sentences) explaining the fit

Return JSON array:
[
  {
    "supplierId": "id",
    "matchScore": 85,
    "summary": "Brief explanation of fit and strengths"
  }
]`;

    const userMessage = `Rank these suppliers for categories: ${input.categories.join(', ')}\n\n` +
      `Suppliers:\n` +
      suppliers.map((s, i) => `${i + 1}. ${s.companyName}
- Categories: ${(s.categories as string[]).join(', ')}
- Rating: ${s.rating}/5
- Past Orders: ${s.pastOrdersCount}
- Performance: ${s.performanceSummary || 'No summary'}
- Flags: ${(s.flags as string[] || []).join(', ') || 'None'}`).join('\n\n');

    const { text, tokensUsed } = await this.callGemini(userMessage, {
      systemInstruction: systemPrompt,
      temperature: 0.3,
    });

    const rankings = this.parseJsonResponse<Array<{
      supplierId: string;
      matchScore: number;
      summary: string;
    }>>(text);

    // Merge AI rankings with supplier data
    const ranked: RankedSupplier[] = suppliers.map((supplier) => {
      const ranking = rankings.find((r) => r.supplierId === supplier.id);

      return {
        id: supplier.id,
        companyName: supplier.companyName,
        contactEmail: supplier.contactEmail,
        rating: supplier.rating || 0,
        matchScore: ranking?.matchScore || 50,
        aiSummary: ranking?.summary || supplier.performanceSummary || 'No summary available',
        pastOrdersCount: supplier.pastOrdersCount || 0,
        flags: (supplier.flags as string[]) || [],
        categories: (supplier.categories as string[]) || [],
      };
    });

    // Sort by match score
    ranked.sort((a, b) => b.matchScore - a.matchScore);

    const costUsd = this.calculateCost(tokensUsed);

    return {
      success: true,
      data: ranked,
      tokensUsed,
      costUsd,
    };
  }
}
