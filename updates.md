# Updates — Use-Case Refinements

Chronological log of use-case refinements requested by the product owner
(vishalragh13@gmail.com). Newest first.

**Scope:** this file records **only** product-owner use-case refinements —
changes to what the system should do. It does not track bug fixes, infra,
deployment, or implementation notes. Each entry here is mirrored in the
Use-Case Refinements Log of `rfq-system/MASTER_SPEC.md`.

Entry format:

```
## YYYY-MM-DD — <short title>
**Refinement:** <what the product owner asked for>
**Affects:** <spec section(s) / workflow step(s)>
**Status:** logged | in spec | implemented
```

---

<!-- Add new entries directly below this line -->

## 2026-09-07 — Form builder must define the form, not fill it
**Refinement:** The create-RFQ "Form builder" view is for the buyer to
**define the metadata and layout of the supplier response form** — which
fields suppliers must answer and with what control — **not** to enter quote
data. Suppliers receive this form by email (with a copy of the RFQ PDF for
reference/internal sharing) and fill it in themselves.
- Each commercial field / questionnaire item is shown as a design row:
  editable field **name** (label), response **type**, **Required** toggle,
  reorder, delete — plus a **greyed preview** of the exact control the
  supplier will see (text box, number box, choice dropdown, Yes/No, file
  upload).
- `select`/choice fields get an inline **options editor**.
- Each section carries a one-line description of who answers it and when
  (per line item vs once per quote); a banner states the form is emailed to
  suppliers alongside the PDF.
- The Drafting Agent must never emit a commercial field or question with a
  blank name; blank-named entries are dropped on normalization.

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ — form builder); Drafting Agent.
**Status:** implemented

## 2026-09-07 — Conversational RFQ creation with synced PDF + form builder
**Refinement:** Creating an RFQ becomes a chat-driven refinement loop:
- Buyer attaches **multiple documents** (business requirements, policy, etc.)
  and/or **pastes content as text**, and keeps refining across chat turns.
- The RFQ is (re)generated **only when the buyer explicitly says "update"** —
  the agent then considers the **whole thread so far** and updates the RFQ.
  Conversation can continue and "update" can be repeated.
- The RFQ has **two synced parts**: a **PDF document** and a **single-column
  form builder** for the same content. View **defaults to the PDF**; buyer
  can switch to the form builder; every "update" regenerates **both**
  simultaneously.
- RFQ document structure: header (Buyer, RFQ ID, quote deadline, expected
  delivery, currency, validity) → 1) Line items table → 2) Commercial
  information requested per line item → 3) Quality questionnaire +
  supporting-document upload → 4) Terms & conditions. Worked example:
  `rfq-system/MASTER_SPEC.md` Appendix A.

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ); Drafting Agent; Form
Generation Agent.
**Status:** implemented (commits 2e0aae0, 39aa23e)

**Design decisions (product owner, same day):**
- Form-builder edits apply immediately (no AI call); chat "update" is the
  only trigger that re-runs the Drafting Agent over the thread.
- Uploads: .txt/.md/.csv/.pdf/.docx, parsed to text server-side (pdf-parse,
  mammoth); binary not stored.
- Draft RFQ + full chat thread + versioned RFQ snapshots are persisted.
  This is a POC (≤20 RFQs); storage is not a design constraint, old RFQs
  will be deleted if limits are hit.
