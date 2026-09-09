# Master Requirement — Supplier response via a document preview, not a form

**Status:** proposed (product owner, 2026-09-09). Not yet in `MASTER_SPEC.md`.
Supersedes the supplier-side "fill the form" interaction; builds on the
2026-09-09 fixed per-line-response refinement.

---

## 1. Intent

A supplier responding to an RFQ should never fill a conventional form. They work
in a **chat + live document preview**: they talk to an AI agent and/or attach
documents, and a preview of their quotation fills in as they go. The preview is
where they see what the system understood, what it is unsure about, and what is
still missing.

Data is still captured into a **fixed table structure** underneath — the preview
is a presentation layer over that table, nothing more. Free-form caveats go in a
**notes** text area.

If this works for the supplier side, the buyer-side RFQ **form builder** can be
retired the same way later (chat + live RFQ-document preview) — but that is a
**separate change**, not part of this one.

---

## 2. Screen layout

`/quote/[token]` — two panes, side by side:

- **Left — AI chat.** The supplier types, pastes text, or attaches documents
  (any readable format). The Autofill Agent runs on each turn.
- **Right — document preview.** A styled rendering of the supplier's quotation,
  built from the fixed table. Every field is an anchored, clickable region.
- **Below the preview — notes.** A free text area for caveats, exceptions and
  anything the supplier wants the buyer to read that isn't a structured field.

One-shot submission; the preview locks after submit (unchanged).

---

## 3. The fixed table (unchanged from 2026-09-09, restated)

Per line item, the system captures a fixed, typed structure — identical on every
RFQ, **not buyer-configurable**:

| Field | Type | Default | Must be sourced? |
|-------|------|---------|------------------|
| `canSupply` | `full` / `partial` / `no` | `full` | no — AI infers |
| `unitPrice` | number \| null | — | **yes**, always |
| `currency` | string | the RFQ's currency | no — AI infers |
| `quotedUom` | enum (per piece / per 100 / per box / per kg / …) | derived from the RFQ line's asked unit | no — AI infers |
| `availableQty` | number \| null | = asked qty | no — AI infers |
| `leadTimeDays` | number \| null | — | only if buyer marked it required |
| `moq` | number \| null | — | only if buyer marked it required |

Plus buyer-defined **quote-level** commercial fields and the **quality
questionnaire** (answered once per quote), and the **notes** blob.

### 3.1 System-inferred vs supplier-sourced

- **System-inferred fields** — `canSupply`, `currency`, `quotedUom`,
  `availableQty`. The supplier normally types nothing for these. The AI
  defaults them and overrides only on explicit evidence in the documents
  (e.g. "$" → currency USD; "per 100" → quotedUom; "not quoting items 5, 8" →
  canSupply `no`; "can do 18k of 22k" → `partial` + availableQty).
- **Supplier-sourced fields** — `unitPrice` always; `leadTimeDays` / `moq`
  when required. No sensible default; must come from a document or the chat.
- A **defaulted value is an assumption, not a fact** — see §4.2. It renders
  amber until corroborated or confirmed.
- If `canSupply = no` for a line, that line's `unitPrice` / `currency` /
  `quotedUom` / `availableQty` stop being mandatory and leave the
  "needs attention" list automatically.

---

## 4. Two independent signals on the preview

Confidence and completeness are **separate axes** and must not be collapsed into
one traffic-light.

### 4.1 Colour = confidence (per filled field)

| State | Meaning | Rendering |
|-------|---------|-----------|
| **Confident** | high-confidence extraction, or supplier-confirmed | normal styling |
| **Uncertain** | AI-filled at medium/low confidence, **or** a defaulted/assumed value not yet corroborated | **amber** highlight |
| **Optional-empty** | non-mandatory field, legitimately blank (e.g. discount) | **grey** / muted |

- Colour never means "blocking" — a blank mandatory field has no colour, it is
  on the list (§4.2).
- Every amber field carries a **rationale** pinned to it, shown on hover/click:
  *"Assumed INR — RFQ currency, not stated in your documents"*,
  *"Inferred ₹38 from 'rest same as last year' + your last quote"*.
  This per-field rationale is **structured provenance**; it is distinct from the
  free-form notes blob and is not stored there.

### 4.2 "Needs attention" list = mandatory fields missing

- A **prominent, persistent panel** with a warning icon and a count
  (e.g. "⚠ 4 items need your input").
- Contents = every **mandatory** field with **no value**:
  - line-item blocking fields: `canSupply`, `unitPrice`, `currency`,
    `quotedUom` (per line, minus any line where `canSupply = no`);
  - every buyer-marked `required` quote-level commercial field;
  - every buyer-marked `required` questionnaire item.
- Grouped by area ("Line items: 3", "Quality questionnaire: 1").
- Each entry is a button — see §5.
- An entry disappears the instant a value lands there (typed, extracted from a
  new document, or confirmed).
- **Submit is blocked while the list is non-empty.** (Generalises today's
  "N line items still need a price" gate.)

---

## 5. Highlight ↔ chat scoping

- Clicking a preview highlight **or** a "needs attention" entry:
  1. scrolls the preview to that field and rings it;
  2. sets it as the **active chat context** — the composer shows a chip
     (e.g. "↳ Line 7 — unit of measure") with an × to clear;
  3. focuses the chat composer.
- While a field is active, anything the supplier types or attaches is understood
  by the Autofill Agent as **input for that field** (and anything adjacent it
  can now resolve). The agent prompt gets a "the supplier is clarifying: X"
  preamble and constrains its output accordingly.
- Clearing the chip returns the chat to general mode (fills whatever it can,
  anywhere).
- The panel also supports "jump to next unresolved" so a supplier scanning a
  30-line preview cannot miss a red field.

---

## 6. Agent loop (per supplier turn)

1. Supplier types / pastes / attaches (optionally with an active field).
2. **Autofill Agent** runs over the new input + conversation + the current
   table state, returns per-field patches:
   `{ fieldId | "line:<id>:<field>": { value, confidence: high|medium|low, rationale } }`.
3. Patches merge into the fixed table. Defaulting rules (§3.1) apply for any
   system-inferred field the agent left untouched.
4. Recompute confidence colours (§4.1) and the "needs attention" list (§4.2).
5. Re-render the preview.

The agent never invents a value the documents/chat don't support; unsupported
mandatory fields stay on the list rather than being guessed.

---

## 7. Preview implementation constraint

The preview is a **templated rendering of the fixed table**, not a free-form
document with offset-anchored spans. Each field is emitted as a tagged element
(`data-field="line:<id>:unitPrice"`), so:

- highlighting = a conditional class on that element;
- click target = an exact, stable field id;
- the preview stays in sync with the table for free, because it *is* the table,
  formatted;
- it can share styling / structure with the existing RFQ PDF renderer.

Free-form doc + AI-returned character offsets is explicitly rejected (fragile,
drifts on edit).

---

## 8. Notes vs rationale (do not merge)

| | Where it lives | What it is |
|--|--|--|
| **Per-field rationale** | pinned to the field, shown on hover/click | AI's structured reason for a value or assumption |
| **Notes** | one text area below the preview | free-form supplier caveats / exceptions / outliers the supplier wants the buyer to see ("prices firm only on annual commitment") |

Outliers or exceptions the supplier flags in chat can be routed into the notes
area; per-field reasoning never goes there.

---

## 9. Explicitly out of scope for this change

- Retiring the **buyer-side** RFQ form builder (same pattern, mirrored — later,
  separate change).
- FX conversion between currencies (still flagged, not converted).
- Any change to the buyer-side comparison / evaluation beyond consuming the
  same fixed table it already consumes.

---

## 10. Build checklist (on top of what is merged at `0c62f09`)

1. Autofill Agent output: add `confidence` + `rationale` per field.
2. `line-response.ts`: `missingMandatory(responses, schema, lineItems)` →
   the "needs attention" list; defaulting helpers for system-inferred fields;
   "assumed vs confirmed" state per field.
3. Templated **preview component** — fixed table → tagged, styled RFQ-response
   document; confidence classes; click emits field id.
4. Chat: `activeField` state, context chip, scoped agent prompt.
5. "Needs attention" panel wired to `missingMandatory`; entry click →
   set `activeField` + scroll + focus composer; "jump to next".
6. Submit gate: block while `missingMandatory` is non-empty.
7. Retire the supplier-facing form-fill UI once 3–5 land (`QuoteForm` becomes
   the preview; the form-builder-defined layout still drives which quote-level
   fields and questions exist).
