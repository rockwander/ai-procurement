# Master Spec — Agentic RFQ Procurement System

Canonical description of the product's use cases. Implementation details
(routes, schema, deploy) live in `IMPLEMENTATION_STATUS.md` and the code;
this file is the source of truth for **what the system is supposed to do**.

Use-case refinements requested by the product owner are appended to the
**Use-Case Refinements Log** at the bottom of this file (and mirrored in
`/updates.md` at the repo root). Only the product owner's use-case
refinements are logged there — not bug fixes, infra, or deploy work.

---

## 1. Actors

| Actor | Auth | Description |
|-------|------|-------------|
| **Buyer** (procurement) | Email + password → JWT cookie | Creates and runs RFQs from the dashboard. |
| **Supplier** | None — unique tokenized link only | Fills in one quote form per invitation. No account. |

Seeded buyer: `admin@procurement.ai` / `admin123`.

---

## 2. Core Workflow (buyer)

1. **Create RFQ** — conversational refinement loop
   - **Entry.** Clicking **Create RFQ** goes straight to the chat — a draft
     RFQ is created immediately. There is no policy-selection step.
   - **Inputs.** The buyer assembles inputs for the RFQ by any mix of:
     - attaching **multiple documents** (e.g. business requirements, policy
       documents — more than one of each is allowed), and
     - **pasting content directly** as text.
   - **Chat.** The create-RFQ screen is a chat. The buyer keeps adding
     documents / pasted content / instructions across multiple turns,
     refining the inputs continuously. The system does **not** regenerate
     the RFQ on every message.

   - **Outline → confirm → apply.** Every (re)generation of the RFQ goes
     through the same three steps — the first time and every time after,
     until the buyer saves and exits:
     1. **Outline.** When the buyer asks to build / update the RFQ (or on
        the first message that carries substance), the **Drafting Agent**
        reads the whole thread and replies in the chat with a **proposed
        outline** — not a regenerated RFQ. The outline has two groups:
        - **Supplier must provide** (the Quotation) — sub-headings such as
          *Line items*, *Commercial information requested*, *Quality
          questionnaire*, *Supporting documents*.
        - **Buyer provides** (Terms & scope) — sub-headings such as *Scope
          & instructions*, *Delivery*, *Payment terms*, *Quote validity*,
          *Warranty / replacement*, *Taxes & freight*, *Penalties*.
        Each sub-heading is **ticked by default**. The agent drafts the
        full content of every sub-heading in this step.
     2. **Review.** In the chat, the buyer can:
        - **untick** any sub-heading to exclude it from the RFQ;
        - **click** a sub-heading to see its **already-drafted content**
          rendered in the chat (the line-item table, the exact questions,
          the T&C text) — this shows drafted content, it does **not** make
          a new AI call;
        - reply with changes ("drop MOQ", "add a GSM spec question"); the
          agent posts a **revised outline** and the review restarts.
     3. **Apply.** A **"Confirm & apply to RFQ"** button in the chat writes
        the RFQ from the **ticked** sub-headings — regenerating both views
        (PDF + form builder) and storing a snapshot.

   The buyer can keep chatting and go through outline → confirm → apply
   again to revise. The form builder remains available between rounds for
   direct edits (below).

   - **RFQ = two synchronized views of one artifact:**
     1. a **PDF document** (the human-readable RFQ — see structure below), and
     2. a **single-column form builder** representing the same RFQ.
   - The screen **defaults to showing the PDF document**. The buyer can
     switch to the form-builder view. Both views are kept **simultaneously
     in sync** — each apply regenerates both, and form-builder edits are
     reflected in both.

   **RFQ document structure** (the PDF; the form builder mirrors it):
   - Header block: Buyer, RFQ ID, Quote deadline, Expected delivery,
     Currency, Validity.
   - **1. Line items** — table: Line #, Item, Specification, Qty, Unit
     (dozens of rows supported).
   - **2. Commercial information requested** — the per-line-item fields the
     vendor must provide (unit price, currency, UoM, MOQ, lead time,
     applicable taxes, freight/transport charges, discount).
   - **3. Quality questionnaire** — Yes/No (and free-text) questions, plus a
     "Supporting documents: upload certificates / relevant documents" ask.
   - **4. Terms & conditions** — delivery location, payment terms, quote
     validity, delivery commitment, warranty/replacement, taxes & freight
     treatment, penalties.

   See **Appendix A** for a full worked example of the RFQ document.

   - **Form builder (single column)** operates on the same RFQ the PDF
     renders. It **defines the supplier response form** (field names, types,
     which are mandatory, order) — it is not for entering quote data.
     Suppliers receive this form by email with a copy of the PDF for
     reference. It exposes every section as editable groups:
     - **Line items** — add / delete / reorder rows; edit item,
       specification, qty, unit.
     - **Commercial information requested** — the per-line-item fields
       vendors must fill; add / delete / reorder / rename, set type
       (text / number / choice, with an options editor for choice), toggle
       mandatory. Each field shows a greyed preview of the control the
       supplier will see.
     - **Quality questionnaire** — add / delete / reorder / edit questions,
       set response type (Yes-No / free text / file), toggle mandatory, with
       the same supplier-facing preview.
     - **Header** and **Terms & conditions** — editable text.
   - **Direct edits in the form builder apply immediately** to the RFQ and
     re-render the PDF — no AI call. The chat path (outline → confirm →
     apply) is the only AI regeneration. Both paths keep the two views in
     sync.

   **Persistence.** A draft RFQ row is created as soon as the buyer starts
   the chat. The full chat thread (messages + attached-document text +
   pasted content + proposed outlines) is stored against it, and each
   **apply** stores a new RFQ snapshot (history kept). Nothing is sent to
   suppliers until step 3.

   **Document handling.** The chat accepts pasted text and file uploads of
   **.txt / .md / .csv / .pdf / .docx**. Uploaded files are parsed to text
   server-side on upload (PDF via `pdf-parse`, DOCX via `mammoth`); only the
   extracted text is kept in the thread — the binary is not stored.

2. **Find & invite suppliers**
   - The screen **lists every active supplier up front**. The buyer can
     filter client-side (category, min rating, exclude flagged, text search),
     **multi-select directly**, and send — no agent run required.
   - **Pre-Filtering Agent** is optional: "Rank by fit with AI" ranks and
     annotates the same list (match score + blurb from rating / flags / past
     performance); it reorders, it does not gate selection.

3. **Select suppliers & send**
   - Buyer multi-selects suppliers (with a select-all for the current filter).
   - System creates tokenized invitations, renders the RFQ PDF, and emails
     each supplier a summary + PDF + unique form link.
   - Per non-responding supplier: manual "send reminder".

4. **Quote comparison**
   - All submissions in one table.
   - Sort and filter on parent **and** child fields (line-item unit price,
     questionnaire answers).
   - Show / hide columns.

5. **Award**
   - Buyer describes a procurement strategy in natural language.
   - **Quote Evaluation Agent** proposes an award split with reasoning.
   - Buyer reviews the summary and confirms.
   - System emails a PO (with PDF) per awarded supplier.

6. **Purchase Orders** — list of generated POs.

---

## 3. Supplier Flow

- Opens `/quote/[token]` — no login, link is the only credential.
- Form = line-item pricing + buyer-configured fields.
- **AI chat sidebar**: supplier pastes documents / converses; the
  **Autofill Agent** extracts field values and pushes them into the form.
- One-shot submission; the form locks after submit.

---

## 4. AI Agents

| Agent | Role | Model |
|-------|------|-------|
| Drafting | Whole create-RFQ thread → **proposed outline** (2 groups, ticked sub-headings, drafted content per heading), then the structured RFQ document on **apply** | `gemini-flash-latest` (fallbacks: `gemini-flash-lite-latest`, `gemini-3-flash-preview`) |
| Pre-Filtering | Category filter → ranked suppliers with summaries | `gemini-flash-lite-latest` (fallback `gemini-3-flash-preview`) |
| Quote Evaluation | NL strategy + quotes → award split + reasoning | `gemini-flash-latest` |
| Autofill | Supplier documents / chat → extracted form values (coerced to the fixed form) | `gemini-flash-latest` |

The supplier quote-form schema is **derived deterministically** from the RFQ
document (`rfqDocumentToFormSchema`), not generated by an agent.

Provider: Google Gemini. Each agent tries its model chain (primary →
fallbacks) with short retries per model; a non-transient error (e.g. a
model no longer available to the key) rolls straight to the next model.
`GEMINI_MODEL` / `GEMINI_MODEL_LITE` / `GEMINI_MODEL_FALLBACK`
(comma-separated) override the defaults.

---

## 5. Platform

- **DB**: Neon serverless Postgres (`drizzle-orm/neon-http`). 13 tables
  (adds `rfq_draft_messages`, `rfq_document_versions`).
- **Email**: Resend (test mode delivers only to the account owner until a
  domain is verified).
- **PDF**: `@react-pdf/renderer` — RFQ document, Purchase Order document.
- **Hosting**: Vercel. Root directory `rfq-system`, Next.js auto-detected.
- **Auth**: JWT in an httpOnly cookie.

---

## Use-Case Refinements Log

Product-owner use-case refinements only, newest first. Each entry is also
recorded in `/updates.md`.

<!-- Add new entries directly below this line -->

### 2026-09-09 — Per-line supplier response is a fixed schema, not buyer-defined

**Refinement:** The fields a supplier fills **for each line item** are a fixed,
typed structure, identical on every RFQ — not buyer-defined. This gives the
quote-comparison and NL-analysis agents typed data to reason over (normalise
currency / UoM, detect partial coverage) rather than free-form fields to guess
at.

Per line item, every supplier answers: **Can supply?** (`full` / `partial` /
`no`), **Unit price** (number, blank if not quoting), **Quoted currency**
(defaults to RFQ currency, overridable per line), **Quoted unit of measure**
(e.g. *per piece* / *per 100* / *per box* / *per kg*; normalised to the RFQ's
asked unit), **Quantity they can supply** (defaults to asked qty), **Lead time
(days)**, **MOQ** (optional).

**The form is a superset of the PDF, not a mirror.** "Can you supply this item /
this quantity" is a bid-capture concept and lives only in the form. The PDF's
§2 "Commercial information requested" becomes a generated description of this
fixed grid. The form builder shows the grid read-only (plus optional-toggle
rows) and no longer allows add / rename / delete of per-line commercial fields.

**Buyer still defines freely:** the quality questionnaire, header, terms, and
new **quote-level** commercial fields answered once per quote (tooling charges,
rebate tiers, …).

**Affects:** Core Workflow step 1 (Create RFQ — form builder; RFQ document
structure §2), step 4 (Quote comparison); §3 Supplier Flow; Drafting Agent
(stops emitting per-line commercial fields); Autofill Agent (targets the fixed
grid with per-cell confidence); `rfqDocumentToFormSchema`; supplier quote form;
comparison columns; `quote_submissions.line_items` shape.

**Design decisions (product owner):**
- Per-line response fields are fixed and typed; buyer customisation moves to the
  questionnaire and to quote-level commercial fields.
- `canSupply` is explicit, so the comparison never infers intent from a blank.
- Currency and UoM are captured per line, defaulting to the RFQ's values.
- Form is a superset of the PDF; not two renderings of one identical structure.

**Status:** in spec

### 2026-09-08 — Create RFQ opens straight into the chat (no policy picker)

**Refinement:** Clicking **Create RFQ** redirects straight to the create-RFQ
chat, creating the draft RFQ immediately. The general-policy checkbox screen
that used to precede it is removed — policies no longer apply as a
pre-selection step. Any policy the RFQ needs is supplied as an attached
document in the chat like any other input.

**Affects:** Core Workflow step 1 (Create RFQ — entry).

### 2026-09-08 — Create RFQ: outline → confirm → apply on every (re)generation

**Refinement:** Once the buyer supplies the relevant documents, the
create-RFQ chat follows a fixed flow, repeated on **every** (re)generation
until the buyer saves and exits:

1. Buyer attaches docs / pastes content / gives context.
2. The system replies in the chat with a **proposed outline** — a
   confirmation of what will go into the RFQ, not a regenerated RFQ. It is
   split into two groups:
   - **Supplier must provide** (Quotation) — sub-headings: line items,
     commercial information requested, quality questionnaire, supporting
     documents.
   - **Buyer provides** (Terms & scope) — sub-headings: scope &
     instructions, delivery, payment terms, quote validity, warranty /
     replacement, taxes & freight, penalties.
3. Every sub-heading is **ticked by default**; the buyer can **untick** any
   to exclude it. The buyer can **click a sub-heading** to see its
   **already-drafted content** in the chat (line-item table, exact
   questions, T&C text) — this shows drafted content, no new AI call. The
   buyer can also reply with changes and get a revised outline.
4. A **"Confirm & apply to RFQ"** button in the chat regenerates the RFQ
   (synced PDF + form builder) from the **ticked** sub-headings.

**Affects:** Core Workflow step 1 (Create RFQ); Drafting Agent (now emits
an outline stage before the document); persistence (outlines stored in the
thread).

**Design decisions (product owner):**
- The outline-confirm flow repeats on every regeneration, not just the
  first.
- Sub-headings are ticked by default; unticking excludes a section.
- Clicking a heading shows content drafted in the outline step — never a
  fresh Gemini call.
- Group labels: "Supplier must provide" and "Buyer provides".

**Status:** in spec

### 2026-09-08 — Find & invite suppliers: show all first, filter/select inline

**Refinement:** Under "Find & invite suppliers", show **all suppliers in a
list immediately**. The buyer applies the existing filters (category, min
rating, exclude flagged) — now client-side — or just multi-selects from the
full list and triggers the send. Running the AI pre-filtering agent is
**optional** ("Rank by fit with AI") and only ranks/annotates the same list;
it no longer gates the list behind a required category + agent run.

**Affects:** Core Workflow step 2 (Find & invite suppliers); Pre-Filtering
Agent (now optional).

### 2026-09-07 — Form builder must define the form, not fill it

**Refinement:** The create-RFQ "Form builder" view defines the **metadata and
layout of the supplier response form** — which fields suppliers must answer
and with what control — it is **not** a form for entering quote data.
Suppliers receive this form by email (with a copy of the RFQ PDF for
reference / internal sharing) and fill it in themselves.
- Each commercial field / questionnaire item renders as a design row:
  editable field **name**, response **type**, **Required** toggle, reorder,
  delete — plus a **greyed preview** of the exact control the supplier will
  see (text / number / choice dropdown / Yes-No / file upload).
- `select` / choice fields expose an inline **options editor**.
- Each section shows a one-line description of who answers it and when (per
  line item vs once per quote); a banner states the form is emailed to
  suppliers with the PDF.
- The Drafting Agent must never emit a commercial field or question with a
  blank name; blank-named entries are dropped during `normalizeRFQDocument`.

**Affects:** Core Workflow step 1 (Create RFQ — form builder); Drafting Agent.

### 2026-09-07 — Conversational RFQ creation with synced PDF + form builder

**Refinement:** Creating an RFQ is a chat, not a one-shot form:
- Buyer can attach **multiple documents** (business requirements, policy,
  etc.) and/or **paste content as text**, across many chat turns, refining
  inputs continuously.
- The RFQ is (re)generated only when the buyer **explicitly says "update"**;
  the agent then considers the **entire thread so far** and updates the RFQ.
  The buyer can keep conversing and say "update" again.
- The RFQ has **two parts that stay in sync**: a **PDF document** and a
  **single-column form builder** for the same content. The view **defaults
  to the PDF**; the buyer can switch to the form builder. Every "update"
  regenerates **both** simultaneously.
- RFQ document structure: header (Buyer, RFQ ID, deadline, expected
  delivery, currency, validity), 1) Line items table, 2) Commercial
  information requested per line item, 3) Quality questionnaire +
  supporting-document upload, 4) Terms & conditions. Worked example in
  Appendix A.

**Affects:** Core Workflow step 1 (Create RFQ); Drafting Agent; Form
Generation Agent; adds Appendix A.

**Design decisions (2026-09-07, product owner):**
- Form-builder edits apply **immediately** (no AI call); chat "update" is
  the only AI-regeneration trigger.
- Uploads accept **.txt/.md/.csv/.pdf/.docx**; parsed to text server-side,
  binary not stored.
- Draft RFQ + full chat thread + versioned RFQ snapshots are **persisted**
  (POC scale — ≤20 RFQs; storage is not a constraint).

**Status:** implemented (commits 2e0aae0, 39aa23e; deployed + smoke-tested in prod)

---

## Appendix A — Worked example of an RFQ document

```markdown
# Sample RFQ

### RFQ: Corrugated Packaging

**Buyer:** ABC Manufacturing

**RFQ ID:** RFQ-2026-001

**Quote deadline:** 15 Sep 2026

**Expected delivery:** Monthly supply, starting Oct 2026

**Currency:** INR

**Validity:** Quote valid for 90 days

#### 1. Line items

| Line | Item | Specification | Qty | Unit |
| --- | --- | --- | --- | --- |
| 1 | Carton Box A | 5-ply, 12×10×8 in | 10,000 | pcs |
| 2 | Carton Box B | 5-ply, 18×12×10 in | 8,000 | pcs |
| 3 | Carton Box C | 3-ply, 10×8×6 in | 12,000 | pcs |
| ... | ... | ... | ... | ... |
| 30 | Carton Box AD | 5-ply, ... | 5,000 | pcs |

#### 2. Commercial information requested

For **each line item**, vendor should provide:

- Unit price
- Currency
- Unit of measurement
- MOQ
- Lead time
- Applicable taxes
- Freight/transport charges
- Discount, if any

#### 3. Quality questionnaire

Example:

| Question | Vendor response |
| --- | --- |
| Do you have ISO 9001 certification? | Yes/No |
| Can you meet the specified GSM/bursting strength? | Yes/No |
| Do you have a quality inspection process? | Yes/No |
| Can you provide samples before production? | Yes/No |
| Have you supplied similar packaging at this volume? | Yes/No |

**Supporting documents:** Upload certificates / relevant documents.

#### 4. Terms & conditions

- Delivery location
- Payment terms
- Quote validity
- Delivery commitment
- Warranty/replacement terms
- Taxes and freight treatment
- Penalties, if applicable
```
