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
| **Supplier** | None — unique tokenized link only | Submits one quotation per invitation, via the link (chat + preview) or by replying to the invitation email. No account. |

Seeded buyer: `admin@procurement.ai` / `admin123`.

---

## 2. Core Workflow (buyer)

1. **Create RFQ** — conversational refinement loop
   - **Entry.** Clicking **Create RFQ** goes straight to the chat — a draft
     RFQ is created immediately. There is no policy-selection step.
   - **Inputs.** The buyer assembles inputs for the RFQ by any mix of:
     - attaching **multiple documents** (e.g. business requirements, policy
       documents — more than one of each is allowed). Readable formats are
       PDF, Word (.docx), CSV, plain text / Markdown, **and images**
       (PNG / JPEG / WebP / GIF — photos, scans, screenshots). Images are
       transcribed to text server-side via Gemini vision; only the text is
       kept in the thread, and
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
        (PDF + RFQ preview) and storing a snapshot.

   The buyer can keep chatting and go through outline → confirm → apply
   again to revise. Between rounds, the buyer refines individual fields by
   **typing the request in the same chat** (below) — there is no form builder.

   - **RFQ = two views of one artifact:**
     1. a **PDF document** (the human-readable RFQ — see structure below), and
     2. a **read-only RFQ preview** rendering the same RFQ as a document
        (the buyer counterpart to the supplier's quotation preview).
   - The screen **defaults to showing the PDF document**. The buyer can
     switch to the RFQ preview. Both are regenerated on every apply / edit.

   **RFQ document structure** (the PDF; the RFQ preview mirrors it):
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

   - **RFQ preview (read-only)** renders the same RFQ the PDF renders, as a
     document — line-item table, the quote-level commercial fields (each with
     its datatype and a "required" marker), the questionnaire, the terms. It
     **defines the supplier response form**: suppliers receive this form by
     email with a copy of the PDF for reference. There are **no input
     controls and no inline editing** in this view.
   - **The buyer refines the form by chatting.** In the create-RFQ
     conversation the buyer types requests like "make Freight charges
     required", "rename GST to Tax %", "add a yes/no question about 30-day
     credit", "make Payment terms a dropdown of Net 30 / Net 45 / Net 60",
     "remove the price validity field", "change GST to a number". An **RFQ
     Edit Agent** applies the instruction to the current RFQ document (every
     existing id preserved), the RFQ is re-persisted (form schema + line
     items + PDF re-derived), and the changed rows briefly highlight in the
     preview. This is distinct from the outline → confirm → apply flow, which
     handles *structural* (re)generation; edits are a refinement layer on the
     already-applied RFQ.
   - **Clicking a passage scopes the chat to it.** Any heading, field,
     question or term in the RFQ preview is clickable — it rings the passage
     and the composer shows "re: …", so the buyer's next message is feedback
     about that passage ("this question is too vague", "we don't need this
     term"). The Edit Agent interprets the feedback and applies the change it
     implies; if the feedback isn't actionable it replies without changing the
     document.
   - **The AI never marks a field mandatory on its own.** On generation /
     regeneration, every commercial field and questionnaire question is
     optional unless the buyer explicitly asked for it to be required.

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
     each supplier a summary + PDF + unique form link. The subject carries a
     machine-readable token marker (`[ref: <rfqId> / <token>]`) so a plain
     email reply can be matched back to the invitation (see §3 — Responding
     by email).
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
- **Not a form. A chat + live document preview.** Two panes: AI chat (left),
  a preview of the supplier's quotation (right), a free-text notes area (below).
- The supplier types, pastes, or attaches documents; the **Autofill Agent**
  runs each turn and fills the **fixed per-line table**
  (attachments may be PDF, Word, CSV, text, or an **image** — photo / scan /
  screenshot of a quote or price list — transcribed to text via Gemini vision;
  the binary is never stored)
  - **Lines the document didn't cover become "not offered".** If an uploaded
    document quotes only some line items, the rest are marked `canSupply: 'no'`
    (struck through in the preview, no price demanded) with a "confirm you're
    not quoting this" prompt — a blocker in-app, and on the email path a
    verify item that stops an auto-submit and sends the link instead. The
    supplier confirms in the preview's Supply cell or via the assistant. (§2 — `canSupply`,
  `unitPrice`, `currency`, `quotedUom`, `availableQty`, `leadTimeDays`, `moq`)
  plus the buyer-defined quote-level fields and questionnaire. The preview is a
  **templated rendering of that table** — each field a tagged element — not a
  free-form document.
- **System-inferred fields** — `canSupply`, `currency`, `quotedUom`,
  `availableQty` — are AI-defaulted (currency = the RFQ's; UoM = derived from
  the asked unit; canSupply = `full`; availableQty = asked qty) and overridden
  only on explicit evidence. The supplier normally types nothing for them.
  `unitPrice` is always supplier-sourced; `leadTimeDays` / `moq` only when the
  buyer marked them required.
- **Colour = confidence** on the preview: normal (high / supplier-confirmed),
  **amber** (AI-filled at medium/low confidence, or a defaulted assumption not
  yet corroborated — carries a rationale pinned to the field), grey (optional,
  blank). Colour never means "blocking".
- **"Needs attention" list** — a prominent, persistent panel listing every
  **mandatory** field with **no value**: line-item blocking fields (minus any
  line with `canSupply = no`), buyer-required quote-level fields, buyer-required
  questionnaire items. **Submit is blocked while it is non-empty.**
- **Highlight ↔ chat scoping:** clicking a preview highlight or a "needs
  attention" entry rings the field and sets it as the active chat context
  (composer shows a chip); the supplier's next input is understood as data for
  that field.
- **Notes** area holds free-form supplier caveats; per-field **rationale** is
  separate structured provenance, pinned to the field, never merged into notes.
- One-shot submission; the preview locks after submit.

### Responding by email (alternative entry path)

A supplier can also respond **by replying to the invitation email** — free-text
body + attachments (any readable format) — without opening the link:

- Inbound via a **Resend inbound webhook** → `POST /api/quote/inbound`. The
  email is matched to the invitation by a **token marker in the subject line**
  (`[ref: <rfqId> / <token>]`, preserved on reply) **and** the sender address
  matching the supplier's `contact_email`. No token / sender mismatch /
  already-submitted → an auto-reply points them to the link; nothing is
  processed.
- Body text + parsed attachments feed the **same Autofill Agent**; patches
  merge into a server-side **draft** (`quote_drafts`, keyed by invitation) so
  the link opens with the emailed data already filled. The email body becomes
  the first turn of the `/quote/[token]` chat thread.
- **Auto-submitted only when there are no blockers AND no *uncertain* amber
  fields** (AI extractions at medium/low confidence). A bare system default
  (currency = the RFQ's, UoM = the asked unit) is `assumed`/amber but does
  **not** block — it's the safe value and is listed in the ack email for
  awareness. Any blocker *or* any uncertain field → **not submitted**, draft
  parked on the link.
- The system **emails the supplier back** (`email_logs.type` = `quote_ack`)
  with: the RFQ link (always); the blockers, grouped as the "needs attention"
  panel; the amber values with their rationale to verify. The headline states
  plainly whether the quotation is submitted, not submitted (blockers), or
  ready-but-not-submitted (amber only).

An email-submitted quotation is identical downstream to a link-submitted one
(same `quote_submissions` row, same comparison and evaluation).

- A POC **Supplier Mailbox** (`/dashboard/mailbox`) lists every outbound email
  and lets the buyer reply "as the supplier" through the same processor the
  webhook uses — so the flow is testable without a verified mail domain.

### Review / negotiation round

From **Compare quotes**, a supplier column header opens that supplier's full
submitted quotation at `/dashboard/rfqs/[id]/quotes/[invitationId]`. The buyer
clicks any response value to attach a comment, collects several, and hits **one
"Send to supplier" button**.

- On send, `QuoteCommentAgent` classifies each comment as **review** (clarify /
  complete / fix a wrong answer) or **negotiation** (revise a commercial term)
  and drafts the supplier's message, adapting to whether the round is
  review-only, negotiation-only, or both. Fallback on AI failure: all `review`
  + generic copy.
- Sending stamps each `quote_comments` row with its own `intent` + `sent`,
  flips the invitation to **`negotiating`**, seeds an editable `quote_drafts`
  row from the submission, and emails the supplier (`[ref:]` subject marker;
  comments split into "Clarifications needed" / "Points to negotiate";
  `email_logs.type` `quote_review` for a review-only round else
  `quote_negotiation`).
- The supplier's link is **unlocked** while `negotiating`; the buyer's notes
  show as `💬 buyer` markers pinned to the fields. The supplier edits anything
  (no field lock for the POC) and resubmits.
- Resubmit **overwrites** the `quote_submissions` row in place (bumps
  `revision`, sets `revised_at`), marks that round's comments `addressed`,
  returns the invitation to `submitted`, and emails the buyer
  (`quote_revised`). Works from the link and by email reply.
- Rounds repeat. Award is never blocked; a supplier still in `negotiating` is
  excluded from evaluation until they resubmit.

See `REQUIREMENT_supplier-doc-preview.md`, `REQUIREMENT_quote-via-email.md`,
and `REQUIREMENT_quote-negotiation.md` for the full requirements.

---

## 4. AI Agents

| Agent | Role | Model |
|-------|------|-------|
| Drafting | Whole create-RFQ thread → **proposed outline** (2 groups, ticked sub-headings, drafted content per heading), then the structured RFQ document on **apply** | `gemini-flash-latest` (fallbacks: `gemini-flash-lite-latest`, `gemini-3-flash-preview`) |
| Pre-Filtering | Category filter → ranked suppliers with summaries | `gemini-flash-lite-latest` (fallback `gemini-3-flash-preview`) |
| Quote Evaluation | NL strategy + quotes → award split + reasoning | `gemini-flash-latest` |
| Autofill | Supplier documents / chat → per-field patches for the fixed table, each with `confidence` (high/medium/low) and a short `rationale`; may be scoped to one active field | `gemini-flash-latest` |
| Quote Comment | Buyer's comments on a submitted quote → per-comment `review` / `negotiation` tag + drafted supplier message (review-only / negotiation-only / both) | `gemini-flash-latest` |

The supplier quote-form schema is **derived deterministically** from the RFQ
document (`rfqDocumentToFormSchema`), not generated by an agent.

Provider: Google Gemini. Each agent tries its model chain (primary →
fallbacks) with short retries per model; a non-transient error (e.g. a
model no longer available to the key) rolls straight to the next model.
`GEMINI_MODEL` / `GEMINI_MODEL_LITE` / `GEMINI_MODEL_FALLBACK`
(comma-separated) override the defaults.

---

## 5. Platform

- **DB**: Neon serverless Postgres (`drizzle-orm/neon-http`). 15 tables
  (adds `rfq_draft_messages`, `rfq_document_versions`, `quote_drafts`,
  `quote_comments`).
- **Email**: Resend — outbound (invitation / reminder / PO / quote-ack) and
  **inbound** (supplier email replies → `POST /api/quote/inbound` webhook,
  signature-verified with `RESEND_INBOUND_SECRET`). Test mode delivers
  outbound only to the account owner until a domain is verified.
- **PDF**: `@react-pdf/renderer` — RFQ document, Purchase Order document.
- **Hosting**: Vercel. Root directory `rfq-system`, Next.js auto-detected.
- **Auth**: JWT in an httpOnly cookie.

---

## Use-Case Refinements Log

Product-owner use-case refinements only, newest first. Each entry is also
recorded in `/updates.md`.

<!-- Add new entries directly below this line -->

### 2026-09-11 — Review / negotiate a submitted quotation

**Refinement:** The buyer needs to send a submitted quote back to the supplier
for changes. From Compare quotes, expand a supplier to see their full submitted
quotation on its own page; click any response value to attach a comment;
collect several; hit **one "Send to supplier" button**. The email reopens their
quotation for editing; on resubmit it locks again.

- **AI classifies** each comment as `review` (clarify / complete / fix a wrong
  answer) or `negotiation` (revise a commercial term) and drafts the
  supplier's message, adapting to review-only / negotiation-only / both. The
  buyer doesn't choose; no override for the POC. Fallback on AI failure: all
  `review` + generic copy. Supplier sees the comments split into
  "Clarifications needed" / "Points to negotiate".
- POC scope: supplier can edit **everything** on resubmit (no field lock); no
  threaded comment replies (they just edit and resubmit); the submission row is
  overwritten with a `revision` counter (no version history); award is never
  blocked (a supplier still `negotiating` is excluded from evaluation until
  they resubmit).
- New: `rfq_invitations.status` value `negotiating`; `quote_comments` table
  (`intent` set by the AI on send); `quote_submissions.revision` / `revised_at`;
  `email_logs.type` values `quote_review` / `quote_negotiation` /
  `quote_revised`; `QuoteCommentAgent`. Buyer page
  `/dashboard/rfqs/[id]/quotes/[invitationId]`. See
  `REQUIREMENT_quote-negotiation.md`.

**Affects:** §3 (Supplier Flow), §5 (Platform — DB), workflow step 4
(Compare / Award).

### 2026-09-10 — A partial quotation means "not offered" on the other lines

**Refinement:** When a supplier uploads a document that quotes only some line
items, the system must treat the uncovered lines as *not offered* — not leave
them as mandatory "provide a unit price" blockers.

- After the Autofill Agent runs over the document(s),
  `inferNoBidForUncoveredLines()` marks every line the agent produced no value
  for as `canSupply: 'no'` with an `inferredNoBid` provenance flag. It only
  touches lines still at the untouched default (`full`, no price, unconfirmed),
  and no-ops if the agent matched nothing.
- Preview: the line is struck through, shows "not offered ⓘ confirm"; its
  price / UoM fields no longer count as missing-mandatory.
- The inferred no-bid **is** a to-confirm item: a blocker in the in-app
  "needs attention" panel (`missingMandatory` now takes provenance), and an
  `uncertain` "please verify" item on the email path (`collectLowConfidence`),
  so an emailed partial quote gets the ack email + link, never an auto-submit.
- The supplier clears it by opening the Supply cell (any choice, including
  leaving it "not offered") or telling the assistant they can supply the line.

**Affects:** §3 (Supplier Flow), `REQUIREMENT_quote-via-email.md` §4.

### 2026-09-10 — Chat attachments accept images (supplier quote assistant + create-RFQ)

**Refinement:** Both AI chats that take document attachments — the supplier
quote assistant (`/quote/[token]`) and the create-RFQ conversation — now
accept image files (PNG / JPEG / WebP / GIF): photos, scans, and screenshots
of quotes, price lists, and spec sheets. Images are transcribed to text
server-side by Gemini vision (`doc-extract.ts`) and then flow through the
existing text-only pipeline (Autofill Agent / RFQ Drafting + Edit Agents)
unchanged. The binary is never stored — only the transcription. Emailed
image attachments on supplier replies are handled the same way
(`inbound-email.ts`).

**Affects:** §2 step 1 (Create RFQ — Inputs), §3 (Supplier Flow), inbound-email
parsing.

### 2026-09-10 — Buyer refines the RFQ by chat; AI never auto-marks fields mandatory

**Refinement:** Two changes to create-RFQ (§2 step 1):

1. **The "Form builder" tab is retired for a read-only RFQ document preview.**
   The right pane now shows **PDF document** and **RFQ preview** — the preview
   renders the RFQ document the way the supplier's quotation preview renders
   theirs (a document, not a form of input controls). There is **no inline
   editing** on the buyer side. All changes to the form definition — rename a
   field or question, make it required / optional, change its datatype
   (text / number / choice; yes-no / free text / file), edit choice options,
   add / remove / reorder fields — are made by **typing the request in the
   create-RFQ conversation**. A new `RFQEditAgent` applies the instruction to
   the current `RFQDocument` (ids preserved), the doc is re-persisted (form
   schema + line items + PDF re-derived), and the changed rows briefly
   highlight in the preview. The **outline → confirm → apply** flow for
   *structural* (re)generation is unchanged; natural-language edits are a
   refinement layer on top of an already-applied document. In the preview,
   **any heading, field, question or term is clickable** — it rings the
   passage and scopes the chat to it ("re: …"), so the buyer's next message is
   feedback about that passage. The agent applies the change the feedback
   implies (reword a vague question, drop a term, …), or replies without
   changing anything when it isn't actionable.

2. **The drafting AI must not mark any field mandatory on its own.** When the
   AI generates or regenerates the RFQ, every commercial field and
   questionnaire question is optional unless the buyer explicitly said that
   field must be provided. (Previously GST / freight / the ISO question came
   back required by default.)

**Affects:** §2 step 1 (Create RFQ — the "form builder" view becomes a
read-only preview; edits and passage-scoped feedback go through the chat);
Drafting Agent (required = false unless asked); new Edit Agent; `draft-chat`
route (`action: 'edit'`, optional `scope`).
**Supersedes** the UI parts of *"Form builder must define the form, not fill
it"* (2026-09-07) and *"Conversational RFQ creation with synced PDF + form
builder"* (2026-09-07) — the `RFQDocument` model and PDF are unchanged; only the
builder UI is replaced.

**Status:** implemented (build green; not verified in a running app — the dev
environment has no Postgres database).

### 2026-09-10 — Comment on any passage; caveats become structured exceptions

**Refinement:** In the supplier document preview, any text is clickable — a
heading, the opening line, and each of the buyer's T&C clauses (now shown
read-only in the quotation). Clicking a passage scopes the chat to it. The
agent then either **applies a field change** (if the comment maps to one) or
records a **structured exception** `{ re, comment }` (if it's a caveat that
isn't a field — e.g. "we need Net 30, not Net 45"); it can do both. Exceptions
show inline (⚠) and in a "Conditions & exceptions" panel, are removable before
submit, are stored on `quote_submissions.exceptions`, and surface to the buyer
in the comparison as a "Conditions raised" column.

**Affects:** §3 Supplier Flow; Autofill Agent (`activePassage` in, `exceptions`
out); `/quote/[token]` GET (returns RFQ terms) + POST (`exceptions`);
`quote_submissions` schema; comparison columns.

**Status:** implemented (browser-verified).

### 2026-09-09 — Accept quotations via email

**Refinement:** A supplier can respond to an RFQ **by replying to the
invitation email** — free-text body + attachments (any readable format) —
without opening the link. The reply runs through the **same Autofill Agent**
as `/quote/[token]`; the system fills the fixed per-line table + quote-level
fields + questionnaire and **emails the supplier back**.

The response email always carries the **RFQ link** (preview + AI assistant),
lists **low-confidence / assumed (amber) values** with their rationale to
verify, and lists **blockers** (mandatory fields still missing) grouped as the
"needs attention" panel.

**Submission decision:** auto-submitted **only when there are no blockers AND
no *uncertain* amber fields** (AI extractions at medium/low confidence). A bare
system default (currency = the RFQ's, UoM = the asked unit) is amber but does
not block — it's the safe value, shown in the ack email for awareness
(product-owner decision, 2026-09-10). Any blocker *or* any uncertain value →
**not submitted**, parked as a draft; the reply states this plainly ("NOT
been submitted — open the link and submit" / "ready but not yet submitted —
verify the highlighted fields"). One-shot submission locks the preview, so a
low-confidence value the supplier never saw must not be frozen in.

**Transport / matching:** Resend **inbound webhook** → `POST
/api/quote/inbound`; matched by a **token marker in the subject line**
(`[ref: <rfqId> / <token>]`, preserved on reply) **and** the sender address
matching the supplier's `contact_email`. No token / mismatch / already-
submitted → auto-reply points to the link, nothing processed.

Requires a server-side **draft** (`quote_drafts`, keyed by invitation) — today
the link flow keeps the in-progress quote only in React state. An
email-submitted quotation is identical downstream to a link-submitted one.

**Affects:** §2 step 3 (invitation subject token marker); §3 Supplier Flow
(email as an alternative entry path); §4 AI Agents (Autofill — new caller,
unchanged contract); §5 Platform (inbound email; `quote_drafts` table;
`email_logs` gains `body_html` + `attachments`); `email.ts` (`quote_ack`
email; subject marker on invitation + reminder); `quote-access.ts`; `GET`/new
`PATCH` `/api/quote/[token]` draft; new `POST /api/quote/inbound`; new
`lib/inbound-email.ts`, `lib/quote-ack.ts`, `lib/quote-inbound.ts`,
`lib/quote-draft.ts`.

**Design decisions (product owner):**
- Auto-submit requires no blockers **and** no *uncertain* amber fields; a bare
  system default (currency/UoM) does not block (2026-09-10).
- Matching is subject-token **plus** sender-address; no fuzzy fallback.
- Inbound via Resend (one vendor for in + out).
- The email body becomes the first turn of the `/quote/[token]` chat thread.

**POC:** real inbound email needs a verified domain + MX; for the POC an
in-app **Supplier Mailbox** (`/dashboard/mailbox`) lists every outbound email
and lets the buyer reply "as the supplier" through the same shared processor
(`processInboundEmail`) the webhook uses.

**Out of scope:** `.xlsx` attachments (named as unreadable in the reply);
fuzzy sender→invitation matching; buyer-facing "how did this quote arrive";
FX conversion (unchanged).

**Full requirement:** `REQUIREMENT_quote-via-email.md`.

**Status:** implemented (browser-verified: price-only → draft-blocked;
complete + USD → auto-submitted; already-submitted → rejected).

### 2026-09-09 — Supplier responds via a document preview, not a form

**Refinement:** The supplier side of an RFQ becomes a **chat + live document
preview**. The supplier talks to the Autofill Agent / attaches documents; a
preview of their quotation fills in as they go. Data is still captured into the
**fixed per-line table** (next entry) plus a free-text **notes** area — the
preview is only a presentation layer.

Two signals on the preview, kept **independent**:
- **Colour = confidence** (per filled field): normal / **amber** (AI-filled at
  medium-low confidence, or a defaulted assumption not yet corroborated) / grey
  (optional, blank). Amber fields carry a rationale pinned to the field.
- **"Needs attention" list**: a prominent panel of every **mandatory** field
  with **no value** (line-item blocking fields minus `canSupply = no` lines,
  buyer-required quote-level fields, buyer-required questionnaire items). Submit
  blocked while non-empty.

`canSupply` / `currency` / `quotedUom` / `availableQty` are AI-defaulted
(system-inferred); the supplier normally types nothing for them. Clicking a
highlight or a list entry scopes the chat to that field. The preview is a
templated rendering of the fixed table (tagged elements), not an offset-anchored
free-form doc. Per-field rationale is distinct from the notes blob.

**Affects:** §3 Supplier Flow (replaces the form-fill interaction); Autofill
Agent (adds per-field `confidence` + `rationale`); `/quote/[token]` UI;
`line-response.ts` (`missingMandatory` + defaulting helpers). Buyer-side
comparison / evaluation unchanged — same fixed table.

**Out of scope:** retiring the buyer-side RFQ form builder (later, separate);
FX conversion.

**Full requirement:** `REQUIREMENT_supplier-doc-preview.md`.

**Status:** in spec

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
