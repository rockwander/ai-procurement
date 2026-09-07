import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { policyDocuments } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getAuthUser, unauthorized, badRequest, serverError } from '@/lib/api';
import { RFQDraftingAgent } from '@/lib/agents/rfq-drafting';
import { FormGenerationAgent } from '@/lib/agents/form-generation';
import { draftToSummary } from '@/lib/rfq-content';

/**
 * Run the Drafting Agent + Form Generation Agent from business requirements.
 * Returns a draft (title/description/lineItems/…) plus a starter form schema.
 * Nothing is persisted here — the client reviews, edits the form, then POSTs
 * to /api/rfqs to save.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const body = await request.json();
    const { businessRequirements, policyIds, itemCategory, deadline } = body as {
      businessRequirements?: string;
      policyIds?: string[];
      itemCategory?: string;
      deadline?: string;
    };

    if (!businessRequirements || businessRequirements.trim().length < 10) {
      return badRequest('businessRequirements is required (at least 10 characters)');
    }

    const policies =
      policyIds && policyIds.length > 0
        ? await db
            .select()
            .from(policyDocuments)
            .where(inArray(policyDocuments.id, policyIds))
        : [];

    const draftingAgent = new RFQDraftingAgent();
    const draftResult = await draftingAgent.draftRFQ({
      businessRequirements,
      policyDocuments: policies.map((p) => ({
        title: p.title,
        content: p.content,
        category: p.category,
      })),
      itemCategory,
      deadline,
    });

    if (!draftResult.success || !draftResult.data) {
      return NextResponse.json(
        { error: draftResult.error || 'Drafting failed' },
        { status: 502 }
      );
    }

    const draft = draftResult.data;

    // Generate a starter form schema from the draft.
    const formAgent = new FormGenerationAgent();
    const formResult = await formAgent.generateForm(
      draftToSummary(draft),
      draft.lineItems
    );

    return NextResponse.json({
      draft,
      formSchema: formResult.success ? formResult.data : { sections: [], fields: [] },
      formGenerationError: formResult.success ? undefined : formResult.error,
      usage: {
        drafting: {
          tokensUsed: draftResult.tokensUsed,
          costUsd: draftResult.costUsd,
          durationMs: draftResult.durationMs,
        },
        formGeneration: {
          tokensUsed: formResult.tokensUsed,
          costUsd: formResult.costUsd,
          durationMs: formResult.durationMs,
        },
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
