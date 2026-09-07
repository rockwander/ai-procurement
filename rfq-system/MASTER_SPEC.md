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
   - **Inputs.** The buyer assembles inputs for the RFQ by any mix of:
     - attaching **multiple documents** (e.g. business requirements, policy
       documents — more than one of each is allowed), and
     - **pasting content directly** as text.
   - **Chat.** The create-RFQ screen is a chat. The buyer keeps adding
     documents / pasted content / instructions across multiple turns,
     refining the inputs continuously. The system does **not** regenerate
     the RFQ on every message.
   - **Explicit update.** Only when the buyer explicitly says **"update"**
     does the **Drafting Agent** take the whole thread so far (all attached
     documents, all pasted content, all instructions) and (re)generate the
     RFQ. The buyer can continue the conversation and say "update" again to
     revise.
   - **RFQ = two synchronized views of one artifact:**
     1. a **PDF document** (the human-readable RFQ — see structure below), and
     2. a **single-column form builder** representing the same RFQ.
   - The screen **defaults to showing the PDF document**. The buyer can
     switch to the form-builder view. Both views are kept **simultaneously
     in sync** — each "update" regenerates both, and edits are reflected in
     both.

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
     re-render the PDF — no AI call. The chat **"update"** is only for AI
     regeneration from the thread. Both paths keep the two views in sync.

   **Persistence.** A draft RFQ row is created as soon as the buyer starts
   the chat. The full chat thread (messages + attached-document text +
   pasted content) is stored against it, and each **"update"** stores a new
   RFQ snapshot (history kept). Nothing is sent to suppliers until step 3.

   **Document handling.** The chat accepts pasted text and file uploads of
   **.txt / .md / .csv / .pdf / .docx**. Uploaded files are parsed to text
   server-side on upload (PDF via `pdf-parse`, DOCX via `mammoth`); only the
   extracted text is kept in the thread — the binary is not stored.

2. **Supplier pre-filtering**
   - **Pre-Filtering Agent** pulls suppliers by category, ranks by fit,
     summarises rating / flags / past performance into a match score + blurb.

3. **Select suppliers & send**
   - Buyer multi-selects suppliers.
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
| Drafting | Whole create-RFQ thread (messages + attached/pasted docs) → structured RFQ document | `gemini-flash-latest` (fallback `gemini-2.5-flash`) |
| Pre-Filtering | Category filter → ranked suppliers with summaries | `gemini-flash-latest` |
| Quote Evaluation | NL strategy + quotes → award split + reasoning | `gemini-flash-latest` |
| Autofill | Supplier documents / chat → extracted form values | `gemini-flash-latest` |

The supplier quote-form schema is **derived deterministically** from the RFQ
document (`rfqDocumentToFormSchema`), not generated by an agent.

Provider: Google Gemini. Retry/backoff on 429/503.

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
