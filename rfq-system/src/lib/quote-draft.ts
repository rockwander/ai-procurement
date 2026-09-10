// Server-side persistence for the in-progress quotation (before submit).
//
// The link flow (`/quote/[token]`) historically kept the whole quote in React
// state. Accepting responses by email (REQUIREMENT_quote-via-email.md) needs it
// to survive on the server, so the supplier opens the link and finds their
// emailed data already filled. One `quote_drafts` row per invitation, upserted.

import { db } from '@/db';
import { quoteDrafts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  emptyLineResponse,
  normaliseLineResponse,
  type LineItemResponse,
  type RFQLineForResponse,
} from '@/lib/line-response';
import type { ProvenanceMap } from '@/lib/line-response-status';

export interface DraftState {
  lineResponses: Record<string, LineItemResponse>;
  formData: Record<string, unknown>;
  notes: string;
  provenance: ProvenanceMap;
}

/**
 * Build the working quote state for an invitation: the persisted draft if there
 * is one, otherwise blank defaults seeded from the RFQ lines + currency (with
 * the system-inferred fields marked `isDefault` so they render amber, exactly
 * as the page does on first open).
 */
export function seedDraftState(
  lines: RFQLineForResponse[],
  rfqCurrency: string,
  draftRow: {
    lineResponses?: unknown;
    formData?: unknown;
    notes?: string | null;
    provenance?: unknown;
  } | null
): DraftState {
  const lineResponses: Record<string, LineItemResponse> = {};
  const persisted = (draftRow?.lineResponses ?? {}) as Record<string, unknown>;

  for (const line of lines) {
    lineResponses[line.id] = draftRow
      ? normaliseLineResponse(persisted[line.id], line, rfqCurrency)
      : emptyLineResponse(line, rfqCurrency);
  }

  let provenance: ProvenanceMap;
  if (draftRow) {
    provenance = (draftRow.provenance ?? {}) as ProvenanceMap;
  } else {
    provenance = {};
    for (const line of lines) {
      provenance[`line:${line.id}:currency`] = {
        isDefault: true,
        rationale: `Assumed ${rfqCurrency} — the RFQ currency`,
      };
      provenance[`line:${line.id}:quotedUom`] = {
        isDefault: true,
        rationale: `Assumed from the asked unit "${line.unit}"`,
      };
    }
  }

  return {
    lineResponses,
    formData: (draftRow?.formData ?? {}) as Record<string, unknown>,
    notes: draftRow?.notes ?? '',
    provenance,
  };
}

/** Merge Autofill patches (already typed by applyAgentPatches) into draft state. */
export function mergePatchesIntoDraft(
  state: DraftState,
  applied: {
    linePatches: Record<string, Partial<LineItemResponse>>;
    formPatches: Record<string, string | number>;
    provenance: ProvenanceMap;
  }
): DraftState {
  const lineResponses = { ...state.lineResponses };
  for (const [itemId, patch] of Object.entries(applied.linePatches)) {
    const current = lineResponses[itemId];
    if (!current) continue;
    lineResponses[itemId] = { ...current, ...patch, itemId };
  }

  const provenance: ProvenanceMap = { ...state.provenance };
  for (const [id, p] of Object.entries(applied.provenance)) {
    // an extracted value corroborates / overrides a bare default
    provenance[id] = { ...provenance[id], ...p, isDefault: false };
  }

  return {
    lineResponses,
    formData: { ...state.formData, ...applied.formPatches },
    notes: state.notes,
    provenance,
  };
}

/** Upsert the draft row for an invitation. */
export async function saveDraft(
  rfqInvitationId: string,
  state: DraftState,
  source: 'email' | 'link'
): Promise<void> {
  const now = new Date();
  await db
    .insert(quoteDrafts)
    .values({
      rfqInvitationId,
      lineResponses: state.lineResponses,
      formData: state.formData,
      notes: state.notes || null,
      provenance: state.provenance,
      source,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: quoteDrafts.rfqInvitationId,
      set: {
        lineResponses: state.lineResponses,
        formData: state.formData,
        notes: state.notes || null,
        provenance: state.provenance,
        source,
        updatedAt: now,
      },
    });
}

export async function deleteDraft(rfqInvitationId: string): Promise<void> {
  await db.delete(quoteDrafts).where(eq(quoteDrafts.rfqInvitationId, rfqInvitationId));
}
