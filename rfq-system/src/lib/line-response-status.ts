// Preview-layer concerns for the supplier document-preview flow
// (REQUIREMENT_supplier-doc-preview.md):
//
//  - which per-line fields are mandatory / blocking
//  - which are AI-defaulted ("system-inferred") vs supplier-sourced
//  - per-field confidence state: confident / assumed / uncertain / empty
//  - the "needs attention" list of mandatory fields with no value
//
// The data shape itself lives in line-response.ts; this module never mutates a
// LineItemResponse, it only classifies one.

import type { LineItemResponse, RFQLineForResponse } from '@/lib/line-response';
import { committedQty, QUOTE_UOM_OPTIONS } from '@/lib/line-response';
import type { FormSchema, FormField } from '@/lib/form-schema';
import { QUESTIONNAIRE_SECTION } from '@/lib/form-schema';

// ---------------------------------------------------------------------------
// Per-line field metadata
// ---------------------------------------------------------------------------

export type LineField =
  | 'canSupply'
  | 'unitPrice'
  | 'currency'
  | 'quotedUom'
  | 'availableQty'
  | 'leadTimeDays'
  | 'moq';

export interface LineFieldMeta {
  field: LineField;
  label: string;
  /** true = the line cannot be comprehended / evaluated without this */
  blocking: boolean;
  /** true = AI defaults this; the supplier normally never types it */
  systemInferred: boolean;
}

export const LINE_FIELD_META: Record<LineField, LineFieldMeta> = {
  canSupply: { field: 'canSupply', label: 'Can supply', blocking: true, systemInferred: true },
  unitPrice: { field: 'unitPrice', label: 'Unit price', blocking: true, systemInferred: false },
  currency: { field: 'currency', label: 'Currency', blocking: true, systemInferred: true },
  quotedUom: { field: 'quotedUom', label: 'Unit of measure', blocking: true, systemInferred: true },
  availableQty: { field: 'availableQty', label: 'Quantity available', blocking: false, systemInferred: true },
  leadTimeDays: { field: 'leadTimeDays', label: 'Lead time (days)', blocking: false, systemInferred: false },
  moq: { field: 'moq', label: 'MOQ', blocking: false, systemInferred: false },
};

export const LINE_FIELDS = Object.keys(LINE_FIELD_META) as LineField[];

/** Stable id for anchoring a per-line field in the preview / chat scope. */
export function lineFieldId(itemId: string, field: LineField): string {
  return `line:${itemId}:${field}`;
}

/** Parse a `line:<id>:<field>` id back to its parts. */
export function parseLineFieldId(
  id: string
): { itemId: string; field: LineField } | null {
  const m = /^line:(.+):([a-zA-Z]+)$/.exec(id);
  if (!m) return null;
  const field = m[2] as LineField;
  if (!(field in LINE_FIELD_META)) return null;
  return { itemId: m[1], field };
}

// ---------------------------------------------------------------------------
// Confidence tracking
// ---------------------------------------------------------------------------

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How the current value of a field got there. Drives the preview colour.
 *  - confident: high-confidence extraction, or the supplier confirmed it
 *  - assumed:   a system-inferred default not yet corroborated by a document
 *               or confirmed by the supplier  → amber
 *  - uncertain: AI filled it at medium/low confidence                → amber
 *  - empty:     no value
 *  - optional-empty: no value, and the field is not mandatory        → grey
 */
export type FieldState = 'confident' | 'assumed' | 'uncertain' | 'empty' | 'optional-empty';

/**
 * Provenance the preview keeps per field id. `extractionConfidence` / `rationale`
 * come from the Autofill agent; `confirmedBySupplier` is set when the supplier
 * explicitly accepts a value (e.g. clicks "confirm" on an amber field or types
 * it themselves).
 */
export interface FieldProvenance {
  extractionConfidence?: Confidence;
  rationale?: string;
  confirmedBySupplier?: boolean;
  /** true when the value equals the system default and nothing corroborated it */
  isDefault?: boolean;
  /**
   * Set on a `line:<id>:canSupply` entry when the system marked the line
   * `canSupply: 'no'` because the supplier's uploaded document said nothing
   * about it. The supplier must confirm (or correct) it before submitting —
   * it counts as a blocker and, on the email path, stops an auto-submit.
   */
  inferredNoBid?: boolean;
}

export type ProvenanceMap = Record<string, FieldProvenance>;

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

/** Classify one line field for rendering. */
export function fieldState(
  value: unknown,
  meta: { blocking: boolean },
  prov: FieldProvenance | undefined,
  opts: { applicable: boolean } = { applicable: true }
): FieldState {
  if (!opts.applicable) return 'optional-empty';
  if (!hasValue(value)) return meta.blocking ? 'empty' : 'optional-empty';

  if (prov?.confirmedBySupplier) return 'confident';
  // A system-inferred "not offered" the supplier hasn't confirmed reads amber.
  if (prov?.inferredNoBid) return 'uncertain';
  if (prov?.isDefault) return 'assumed';
  const c = prov?.extractionConfidence;
  if (c === 'medium' || c === 'low') return 'uncertain';
  // high confidence, or a supplier-typed value with no provenance recorded
  return 'confident';
}

// ---------------------------------------------------------------------------
// "Needs attention" — mandatory fields with no value
// ---------------------------------------------------------------------------

export interface AttentionItem {
  /** anchor id: `line:<itemId>:<field>` or a form field id */
  id: string;
  group: 'line-items' | 'commercial' | 'questionnaire';
  /** e.g. "Line 7 — Unit of measure" */
  label: string;
}

export interface AttentionList {
  items: AttentionItem[];
  byGroup: Record<AttentionItem['group'], number>;
  total: number;
}

/**
 * Every mandatory field that currently has no value:
 *  - per line: blocking fields, minus any line where canSupply === 'no'
 *  - a line the system auto-marked `canSupply: 'no'` (because the uploaded
 *    document didn't mention it) that the supplier hasn't confirmed yet
 *  - quote-level commercial fields the buyer marked required
 *  - questionnaire items the buyer marked required
 */
export function missingMandatory(
  lines: RFQLineForResponse[],
  responses: Record<string, LineItemResponse | undefined>,
  formSchema: FormSchema | null,
  formData: Record<string, unknown>,
  provenance?: ProvenanceMap
): AttentionList {
  const items: AttentionItem[] = [];

  lines.forEach((line, i) => {
    const r = responses[line.id];
    // canSupply always has a value (defaults to 'full'); if it's 'no', the
    // rest of the line's blocking fields no longer apply — but if the system
    // *inferred* the 'no' from a silent document, the supplier still has to
    // confirm it.
    if (r?.canSupply === 'no') {
      const csProv = provenance?.[lineFieldId(line.id, 'canSupply')];
      if (csProv?.inferredNoBid && !csProv.confirmedBySupplier) {
        items.push({
          id: lineFieldId(line.id, 'canSupply'),
          group: 'line-items',
          label: `Line ${i + 1} — confirm you're not quoting this`,
        });
      }
      return;
    }

    for (const field of LINE_FIELDS) {
      const meta = LINE_FIELD_META[field];
      if (!meta.blocking) continue;
      if (field === 'canSupply') continue; // never empty
      const val = r ? (r[field] as unknown) : null;
      if (!hasValue(val)) {
        items.push({
          id: lineFieldId(line.id, field),
          group: 'line-items',
          label: `Line ${i + 1} — ${meta.label}`,
        });
      }
    }
  });

  for (const f of formSchema?.fields ?? []) {
    if (!f.required) continue;
    if (hasValue(formData[f.id])) continue;
    const group: AttentionItem['group'] =
      f.section === QUESTIONNAIRE_SECTION ? 'questionnaire' : 'commercial';
    items.push({ id: f.id, group, label: f.label });
  }

  const byGroup = {
    'line-items': 0,
    commercial: 0,
    questionnaire: 0,
  } as Record<AttentionItem['group'], number>;
  for (const it of items) byGroup[it.group]++;

  return { items, byGroup, total: items.length };
}

/** Is a per-line field currently applicable (used to grey out vs flag)? */
export function lineFieldApplicable(
  field: LineField,
  resp: LineItemResponse | undefined
): boolean {
  if (!resp) return true;
  if (resp.canSupply === 'no') {
    // Only canSupply itself matters on a no-bid line.
    return field === 'canSupply';
  }
  return true;
}

// ---------------------------------------------------------------------------
// Apply agent patches → typed line-field / form-field values + provenance
// ---------------------------------------------------------------------------

export interface AgentPatch {
  value: string | number;
  confidence: Confidence;
  rationale: string;
}

export interface AppliedPatches {
  /** rfq line id -> partial LineItemResponse to merge */
  linePatches: Record<string, Partial<LineItemResponse>>;
  /** form field id -> value */
  formPatches: Record<string, string | number>;
  /** target id -> provenance, for every value written */
  provenance: ProvenanceMap;
  /** targets the agent produced but we couldn't use */
  rejected: Array<{ id: string; raw: string; reason: string }>;
}

function looseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[, ]/g, '').replace(/[^\d.\-]/g, ' ').trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

const CAN_SUPPLY = new Set(['full', 'partial', 'no']);

/**
 * Turn the Autofill agent's patches into typed values for the fixed line grid
 * and the buyer-defined form fields, plus a provenance entry for each.
 * `numericLineFields` (unitPrice, availableQty, leadTimeDays, moq) are coerced
 * to numbers; canSupply / quotedUom are validated against their enums.
 */
export function applyAgentPatches(
  patches: Record<string, AgentPatch>,
  formFields: FormField[]
): AppliedPatches {
  const out: AppliedPatches = {
    linePatches: {},
    formPatches: {},
    provenance: {},
    rejected: [],
  };
  const fieldById = new Map(formFields.map((f) => [f.id, f]));

  for (const [id, patch] of Object.entries(patches)) {
    const rawStr = String(patch.value ?? '').trim();
    const prov: FieldProvenance = {
      extractionConfidence: patch.confidence,
      rationale: patch.rationale || undefined,
    };

    const parsed = parseLineFieldId(id);
    if (parsed) {
      const { itemId, field } = parsed;
      const bag = (out.linePatches[itemId] ??= {});
      switch (field) {
        case 'canSupply': {
          const v = rawStr.toLowerCase();
          if (!CAN_SUPPLY.has(v)) {
            out.rejected.push({ id, raw: rawStr, reason: 'not full/partial/no' });
            continue;
          }
          bag.canSupply = v as LineItemResponse['canSupply'];
          break;
        }
        case 'currency': {
          if (!rawStr) continue;
          bag.currency = rawStr.toUpperCase().slice(0, 8);
          break;
        }
        case 'quotedUom': {
          const v = rawStr.toLowerCase();
          if (!(QUOTE_UOM_OPTIONS as readonly string[]).includes(v)) {
            out.rejected.push({ id, raw: rawStr, reason: 'not a known unit of measure' });
            continue;
          }
          bag.quotedUom = v;
          break;
        }
        default: {
          // numeric line fields
          const n = looseNumber(patch.value);
          if (n == null) {
            out.rejected.push({ id, raw: rawStr, reason: 'no number found' });
            continue;
          }
          (bag as Record<string, unknown>)[field] = n;
        }
      }
      out.provenance[id] = prov;
      continue;
    }

    // form field
    const f = fieldById.get(id);
    if (!f) {
      out.rejected.push({ id, raw: rawStr, reason: 'unknown target' });
      continue;
    }
    if (f.type === 'number') {
      const n = looseNumber(patch.value);
      if (n == null) {
        out.rejected.push({ id, raw: rawStr, reason: 'no number found' });
        continue;
      }
      out.formPatches[id] = n;
    } else if (f.type === 'select') {
      const opts = f.options ?? [];
      const hit =
        opts.find((o) => o.toLowerCase() === rawStr.toLowerCase()) ??
        opts.find((o) => rawStr.toLowerCase().startsWith(o.toLowerCase()));
      if (!hit) {
        out.rejected.push({ id, raw: rawStr, reason: `not one of ${opts.join(' / ')}` });
        continue;
      }
      out.formPatches[id] = hit;
    } else {
      if (!rawStr) continue;
      out.formPatches[id] = rawStr;
    }
    out.provenance[id] = prov;
  }

  return out;
}

/**
 * After the Autofill agent has run over the supplier's uploaded document(s),
 * any RFQ line it produced NO patch for is one the document didn't cover.
 * Treat those as "not offered": mark `canSupply: 'no'` with an
 * `inferredNoBid` provenance flag so the preview strikes them through, the
 * blocking price fields stop being demanded, and the supplier is prompted to
 * confirm (blocker) — or correct it if they can actually supply the line.
 *
 * `current` is the draft state the patches are about to merge into. A line is
 * only converted when it's genuinely untouched there — no price, `canSupply`
 * still the default `'full'`, and the supplier hasn't confirmed it — so a
 * second upload or a manual edit is never clobbered.
 *
 * No-ops unless the agent covered at least one line — a document that mapped
 * onto nothing shouldn't blank the whole quote.
 */
export function inferNoBidForUncoveredLines(
  lines: RFQLineForResponse[],
  applied: AppliedPatches,
  current: {
    responses: Record<string, LineItemResponse | undefined>;
    provenance: ProvenanceMap;
  }
): AppliedPatches {
  const coveredLineIds = new Set(Object.keys(applied.linePatches));
  if (coveredLineIds.size === 0) return applied;

  for (const line of lines) {
    if (coveredLineIds.has(line.id)) continue;
    const csId = lineFieldId(line.id, 'canSupply');

    const r = current.responses[line.id];
    const csProv = current.provenance[csId];
    const untouched =
      (!r || (r.canSupply === 'full' && r.unitPrice == null)) &&
      !csProv?.confirmedBySupplier;
    // Re-affirm an existing inferred no-bid (keep it a blocker) but don't
    // disturb a line the supplier has actually worked on.
    if (!untouched && !csProv?.inferredNoBid) continue;

    applied.linePatches[line.id] = {
      ...applied.linePatches[line.id],
      canSupply: 'no',
    };
    applied.provenance[csId] = {
      extractionConfidence: 'low',
      inferredNoBid: true,
      rationale:
        "Your document didn't mention this line, so it's marked as not offered. " +
        'Change it if you can supply this item.',
    };
  }

  return applied;
}

/** committed vs asked, for the preview's partial badge. */
export function coverageForLine(
  resp: LineItemResponse | undefined,
  line: RFQLineForResponse
): { committed: number; asked: number; partial: boolean; noBid: boolean } {
  const asked = line.quantity;
  if (!resp) return { committed: asked, asked, partial: false, noBid: false };
  if (resp.canSupply === 'no') return { committed: 0, asked, partial: false, noBid: true };
  const committed = committedQty(resp, asked);
  return { committed, asked, partial: committed < asked, noBid: false };
}

// ---------------------------------------------------------------------------
// Exceptions — a supplier's comment against a specific passage of the document
// that isn't a field value (a heading, a T&C clause, the intro line, a line
// item). Stored on the submission as { re, comment }[] and surfaced to the
// buyer in the comparison.
// ---------------------------------------------------------------------------

export interface QuoteException {
  /** short label for the passage the comment is about, e.g. "Payment terms — Net 45" */
  re: string;
  /** the supplier's comment */
  comment: string;
}

export function normaliseExceptions(raw: unknown): QuoteException[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      re: String((e as any)?.re ?? '').trim(),
      comment: String((e as any)?.comment ?? '').trim(),
    }))
    .filter((e) => e.comment.length > 0);
}
