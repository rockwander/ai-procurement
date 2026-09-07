// Maps an AI-extracted answer (often prose) to a value the corresponding HTML
// form control will actually accept. The Autofill agent returns rich,
// human-readable answers; this layer is what makes them "stick" in the form.
//
// The form meta is fixed — the agent has to fit its answer to the field, and
// where it can't be shaped cleanly (e.g. a paragraph for a Yes/No dropdown)
// we keep the full answer as a note and flag the field for manual entry.

import type { FormField, FormSchema } from '@/lib/form-schema';

export interface CoerceResult {
  /** fieldId -> value ready to set on the form control */
  fields: Record<string, string | number>;
  /** RFQ line-item id -> unit price */
  lineItemPrices: Record<string, number>;
  /** fieldId -> the agent's full answer, when it was richer than the control allows */
  notes: Record<string, string>;
  /** fields the agent had data for but the value could not be mapped to the control */
  unresolved: Array<{ fieldId: string; label: string; raw: string; reason: string }>;
}

const LINE_ITEM_PREFIX = 'lineitem:';

const YES_WORDS = ['yes', 'y', 'true', 'available', 'confirmed', 'we do', 'we can', 'we have', 'compliant', 'agreed', 'accept'];
const NO_WORDS = ['no', 'n', 'false', 'not available', 'we do not', 'we don\'t', 'unable', 'cannot', 'can\'t', 'none'];
const UNKNOWN_WORDS = ['tbd', 'to be decided', 'to be confirmed', 'to be finalised', 'to be finalized', 'not stated', 'not provided', 'not answered', 'n/a', 'na', 'pending', 'unknown'];

/** Pull the first sensible number out of a string. Handles INR/₹/$, commas,
 *  ranges ("8-12%" -> 8), trailing units ("90 days" -> 90, "5,000 pcs" -> 5000). */
export function parseLooseNumber(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  if (isUnknownish(s)) return null;
  // strip currency words/symbols
  s = s.replace(/\b(inr|rs\.?|usd|eur|gbp)\b/gi, ' ').replace(/[₹$€£]/g, ' ');
  // first number token (allow decimals and thousands separators)
  const m = s.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function isUnknownish(s: string): boolean {
  const t = s.trim().toLowerCase();
  return UNKNOWN_WORDS.some((w) => t === w || t.startsWith(w + ' ') || t.startsWith(w + '.') || t.startsWith(w + ','));
}

/** Match a free-text answer to one of a select field's options. */
export function matchOption(raw: string, options: string[]): { value: string; matched: boolean } {
  const t = raw.trim().toLowerCase();
  if (!t) return { value: '', matched: false };

  // exact / contained option text
  for (const opt of options) {
    const o = opt.trim().toLowerCase();
    if (t === o || t.startsWith(o + ' ') || t.startsWith(o + ',') || t.startsWith(o + '.') || t.startsWith(o + ' -') || t.startsWith(o + ':')) {
      return { value: opt, matched: true };
    }
  }
  for (const opt of options) {
    if (t.includes(opt.trim().toLowerCase())) return { value: opt, matched: true };
  }

  // yes/no style options
  const yesOpt = options.find((o) => /^(yes|y)$/i.test(o.trim()));
  const noOpt = options.find((o) => /^(no|n)$/i.test(o.trim()));
  if (yesOpt || noOpt) {
    const firstWord = t.split(/[\s,.\-:;]+/)[0];
    if (yesOpt && (YES_WORDS.includes(firstWord) || YES_WORDS.some((w) => t.startsWith(w)))) {
      return { value: yesOpt, matched: true };
    }
    if (noOpt && (NO_WORDS.includes(firstWord) || NO_WORDS.some((w) => t.startsWith(w)))) {
      return { value: noOpt, matched: true };
    }
  }

  return { value: '', matched: false };
}

function fieldById(schema: FormSchema): Map<string, FormField> {
  return new Map(schema.fields.map((f) => [f.id, f]));
}

/**
 * Coerce a flat {targetId -> rawValue} map (from the Autofill agent) into
 * form-ready values. `targetId` is either a form field id, or
 * `lineitem:<rfqLineItemId>` for a per-line unit price.
 */
export function coerceExtraction(
  raw: Record<string, unknown>,
  schema: FormSchema,
  lineItemIds: Set<string>
): CoerceResult {
  const byId = fieldById(schema);
  const out: CoerceResult = { fields: {}, lineItemPrices: {}, notes: {}, unresolved: [] };

  for (const [key, rawVal] of Object.entries(raw)) {
    const rawStr = rawVal == null ? '' : String(rawVal).trim();

    // --- line-item prices ---
    if (key.startsWith(LINE_ITEM_PREFIX)) {
      const liId = key.slice(LINE_ITEM_PREFIX.length);
      if (!lineItemIds.has(liId)) continue;
      const n = parseLooseNumber(rawVal);
      if (n != null && n > 0) out.lineItemPrices[liId] = n;
      continue;
    }

    const field = byId.get(key);
    if (!field) {
      // unknown key - if it looks like a bare rfq line-item id, treat as price
      if (lineItemIds.has(key)) {
        const n = parseLooseNumber(rawVal);
        if (n != null && n > 0) out.lineItemPrices[key] = n;
      }
      continue;
    }

    if (!rawStr || isUnknownish(rawStr)) {
      // agent had nothing usable - leave for manual entry, no note noise
      continue;
    }

    switch (field.type) {
      case 'number': {
        const n = parseLooseNumber(rawStr);
        if (n != null) {
          out.fields[field.id] = n;
          if (!/^\s*-?[\d.,\s]+$/.test(rawStr)) out.notes[field.id] = rawStr;
        } else {
          out.unresolved.push({ fieldId: field.id, label: field.label, raw: rawStr, reason: 'no number found' });
        }
        break;
      }
      case 'select': {
        const opts = field.options ?? [];
        if (opts.length === 0) {
          out.fields[field.id] = rawStr;
          break;
        }
        const { value, matched } = matchOption(rawStr, opts);
        if (matched) {
          out.fields[field.id] = value;
          if (value.trim().toLowerCase() !== rawStr.trim().toLowerCase()) {
            out.notes[field.id] = rawStr;
          }
        } else {
          out.unresolved.push({
            fieldId: field.id,
            label: field.label,
            raw: rawStr,
            reason: `does not match options (${opts.join(' / ')})`,
          });
          out.notes[field.id] = rawStr;
        }
        break;
      }
      case 'date': {
        const t = Date.parse(rawStr);
        if (!Number.isNaN(t)) {
          out.fields[field.id] = new Date(t).toISOString().slice(0, 10);
        } else {
          out.fields[field.id] = rawStr;
          out.notes[field.id] = rawStr;
        }
        break;
      }
      case 'email': {
        const m = rawStr.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
        out.fields[field.id] = m ? m[0] : rawStr;
        break;
      }
      case 'tel': {
        out.fields[field.id] = rawStr;
        break;
      }
      case 'file': {
        // can't autofill a file input - record the mention as a note
        out.notes[field.id] = rawStr;
        break;
      }
      default: {
        // text / textarea - pass through
        out.fields[field.id] = rawStr;
      }
    }
  }

  return out;
}
