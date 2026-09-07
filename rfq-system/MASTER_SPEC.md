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

1. **Create RFQ**
   - Buyer enters business requirements and selects policy documents.
   - **Drafting Agent** writes the RFQ (scope, requirements, terms, line items).
   - **Form Generation Agent** produces a starter quote form (sections + fields).
   - Form builder: rename / add / delete / reorder fields, toggle mandatory.

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
| Drafting | Business requirements + policy → RFQ content + line items | `gemini-flash-latest` (fallback `gemini-2.5-flash`) |
| Form Generation | RFQ → dynamic quote-form schema | `gemini-flash-latest` |
| Pre-Filtering | Category filter → ranked suppliers with summaries | `gemini-flash-latest` |
| Quote Evaluation | NL strategy + quotes → award split + reasoning | `gemini-flash-latest` |
| Autofill | Supplier documents / chat → extracted form values | `gemini-flash-latest` |

Provider: Google Gemini. Retry/backoff on 429/503.

---

## 5. Platform

- **DB**: Neon serverless Postgres (`drizzle-orm/neon-http`). 11 tables.
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

_No refinements logged yet._
