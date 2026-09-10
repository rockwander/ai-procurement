import { NextRequest, NextResponse } from 'next/server';
import { badRequest, notFound, serverError } from '@/lib/api';
import { loadQuoteContext } from '@/lib/quote-access';
import { normalizeRFQDocument } from '@/lib/rfq-document';
import {
  normaliseLineResponse,
  type LineItemResponse,
  type RFQLineForResponse,
} from '@/lib/line-response';
import type { ProvenanceMap } from '@/lib/line-response-status';
import { saveDraft, type DraftState } from '@/lib/quote-draft';

export const runtime = 'nodejs';

// Public: the supplier's in-progress quote, persisted so email → link → email
// round-trips don't lose work. The page PATCHes this (debounced) as the
// supplier edits. Deleted on submit. See REQUIREMENT_quote-via-email.md §6.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ctx = await loadQuoteContext(token);
    if (!ctx) return notFound('This quote link is invalid');
    if (ctx.invitation.status === 'submitted') {
      return badRequest('This quote has been submitted and can no longer be edited');
    }

    const body = (await request.json()) as {
      lineResponses?: Record<string, unknown>;
      formData?: Record<string, unknown>;
      notes?: string;
      provenance?: ProvenanceMap;
    };

    const rfqDoc = ctx.rfq.rfqDocument
      ? normalizeRFQDocument(ctx.rfq.rfqDocument, {
          rfqId: ctx.rfq.id,
          buyer: '',
          fillDefaults: false,
        })
      : null;
    const rfqCurrency = rfqDoc?.header.currency || 'INR';

    const lines: RFQLineForResponse[] = ctx.lineItems.map((li) => ({
      id: li.id,
      itemDescription: li.itemDescription,
      quantity: li.quantity,
      unit: li.unit,
    }));

    // Coerce whatever the client sent to valid typed line responses.
    const lineResponses: Record<string, LineItemResponse> = {};
    const raw = body.lineResponses ?? {};
    for (const line of lines) {
      lineResponses[line.id] = normaliseLineResponse(raw[line.id], line, rfqCurrency);
    }

    const state: DraftState = {
      lineResponses,
      formData: body.formData ?? {},
      notes: typeof body.notes === 'string' ? body.notes : '',
      provenance: body.provenance ?? {},
    };

    await saveDraft(ctx.invitation.id, state, 'link');

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
