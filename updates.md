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

## 2026-09-10 — A partial quotation means "not offered" on the other lines
**Refinement:** When a supplier uploads a document quoting only some line items,
the uncovered lines are marked "not offered" (`canSupply: 'no'`, struck through,
no price demanded) instead of staying as mandatory unit-price blockers. The
inferred no-bid is a to-confirm item — a blocker in the in-app attention panel
and an `uncertain` "please verify" item on the email path, so an emailed partial
quote gets the ack email + link rather than auto-submitting. The supplier clears
it in the preview's Supply cell or via the assistant.
**Affects:** MASTER_SPEC §3 (Supplier Flow), REQUIREMENT_quote-via-email.md §4.
**Status:** implemented

## 2026-09-10 — Chat attachments accept images (supplier quote assistant + create-RFQ)
**Refinement:** Both AI chats that take document attachments — the supplier
quote assistant (`/quote/[token]`) and the create-RFQ conversation — now
accept image files (PNG / JPEG / WebP / GIF): photos, scans, and screenshots
of quotes, price lists, spec sheets. Images are transcribed to text
server-side via Gemini vision and flow through the existing text-only
pipeline; the binary is never stored. Emailed image attachments on supplier
replies are handled the same way.
**Affects:** MASTER_SPEC §2 (Create RFQ — Inputs), §3 (Supplier Flow),
inbound-email parsing.
**Status:** implemented

## 2026-09-10 — Buyer refines the RFQ by chat; AI never auto-marks fields mandatory
**Refinement:** Two changes to create-RFQ:

1. **The "Form builder" tab is retired for a read-only RFQ document preview.**
   The right pane is now **PDF document** + **RFQ preview**; the preview renders
   the RFQ as a document (like the supplier's quotation preview), with **no
   input controls and no inline editing**. Every change to the form definition —
   rename a field/question, make it required or optional, change its datatype
   (text / number / choice; yes-no / free text / file), edit choice options,
   add / remove / reorder fields — is made by **typing the request in the
   create-RFQ conversation**. An RFQ Edit Agent applies it to the current
   document (ids preserved), the RFQ is re-persisted (schema + line items + PDF
   re-derived), and the changed rows briefly highlight in the preview. The
   **outline → confirm → apply** flow for structural (re)generation is unchanged
   — natural-language edits are a refinement layer on the already-applied RFQ.
   In the preview, **any heading, field, question or term is clickable** — it
   rings the passage and scopes the chat to it ("re: …"), so the buyer's next
   message is feedback about that passage. The agent applies a change if the
   feedback implies one (e.g. rewording a vague question, dropping a term);
   otherwise it replies without touching the document.

2. **The drafting AI must not mark any field mandatory on its own.** Generated /
   regenerated RFQs have every commercial field and questionnaire question
   optional unless the buyer explicitly asked for it to be required.

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ — the form-builder view becomes a
read-only preview; edits and passage-scoped feedback go through the chat);
Drafting Agent; new `RFQEditAgent`; `POST /api/rfqs/[id]/draft-chat`
(`action: 'edit'`, optional `scope`); `RFQDocumentPreview` replaces
`RFQDocumentBuilder`. Supersedes the UI parts of the two 2026-09-07 form-builder
entries (the RFQ document model + PDF are unchanged).
**Status:** implemented (production build green; not verified in a running app —
the local dev environment has no Postgres database).

## 2026-09-10 — Supplier can comment on any passage; caveats become structured exceptions
**Refinement:** In the supplier document preview, **any text is clickable**, not
just fields — a section heading, the opening line, and each of the buyer's
**terms & conditions** clauses (now shown read-only in the quotation). Clicking a
passage rings it and scopes the chat to it ("re: …"). When the supplier then
comments:
- if it maps to a **field** (a price, lead time, a questionnaire answer, a
  quote-level commercial field), the agent **applies it**;
- if it's a **caveat / condition / disagreement** that isn't a field
  (e.g. "we can't do Net 45, our standard is Net 30" against a payment T&C), the
  agent records it as a **structured exception** `{ re, comment }` — shown
  inline under the passage (a ⚠ marker) and in a "Conditions & exceptions the
  buyer will see" panel, removable before submit.
- it can be **both** (a value change *and* a caveat).

Exceptions are stored on the submission (`quote_submissions.exceptions` jsonb)
and surface to the buyer in the quote comparison as a **"Conditions raised"**
column. The free-text notes area stays for anything not tied to a passage.

**Affects:** MASTER_SPEC §3 (Supplier Flow); Autofill Agent (adds
`activePassage` input + `exceptions` output); `/quote/[token]` GET (returns the
RFQ terms) + POST (accepts `exceptions`); `quote_submissions` schema; quote
comparison columns.
**Status:** implemented (verified in browser: clicking a T&C clause → chat
scoped → agent recorded the Net 30 exception → shown inline + in the panel).

## 2026-09-09 — Accept quotations via email
**Refinement:** A supplier can respond to an RFQ **by replying to the invitation
email** — free-text body plus attachments (quote PDF, price list, spec sheet,
any readable format) — without opening the link. The system runs the reply
through the **same Autofill Agent** as the `/quote/[token]` page, fills the
fixed per-line table + quote-level fields + questionnaire, and **emails the
supplier back** with:

- the **RFQ link** (preview + AI assistant), always;
- **low-confidence / assumed values** (the amber ones) listed with their
  rationale, for the supplier to verify;
- **blockers** (mandatory fields still missing), grouped as the "needs
  attention" panel groups them.

**Submission decision:** the emailed quotation is **auto-submitted only when
there are no blockers AND no *uncertain* amber fields** (AI extractions at
medium/low confidence). A bare system default (currency = the RFQ's, UoM = the
asked unit) is amber but does **not** block — it's the safe value and appears
in the ack email for awareness (product-owner decision, 2026-09-10). Any
blocker *or* any uncertain value → **not submitted**, parked as a draft on
`/quote/[token]`: with a blocker, "your quotation has NOT been submitted, open
the link and submit"; with only low-confidence values, "ready but not yet
submitted, verify the highlighted fields and press Submit".

Auto-submit is blocked on uncertain values because one-shot submission locks
the preview — a low-confidence value the supplier never saw would be frozen in.

Inbound transport is a **Resend inbound webhook**; the email is matched to the
invitation by a **token marker in the subject line** (preserved on reply)
cross-checked against the **sender address matching the supplier's contact
email**. No token, or a sender mismatch, or an already-submitted invitation →
the reply tells them to use the link; the email is not processed. An
email-submitted quotation is identical downstream to a link-submitted one.

Requires a small server-side **draft** for the in-progress quote (today the
link flow keeps it only in React state) so the link opens with the emailed
data already filled.

**Affects:** §3 Supplier Flow (adds email as an alternative entry path); §5
Platform (adds inbound email); Autofill Agent (same agent, new caller);
invitation + reminder email subject (token marker); `email.ts` (new
`quote_ack` email); new `quote_drafts` table + `GET/PATCH /api/quote/[token]`
draft handling; new `POST /api/quote/inbound` webhook.

**Out of scope:** `.xlsx` attachments (named as unreadable in the reply); fuzzy
sender→invitation matching; buyer-facing "how did this quote arrive" beyond
what `quote_submissions` shows; FX conversion (unchanged).

**Full requirement:** `rfq-system/REQUIREMENT_quote-via-email.md`.

**Status:** implemented (verified in browser: email reply with price only →
draft-blocked; with all fields + USD → auto-submitted; already-submitted →
rejected). Includes an in-app Supplier Mailbox simulator (`/dashboard/mailbox`)
for testing without a mail domain.

## 2026-09-09 — Supplier responds via a document preview, not a form
**Refinement:** The supplier side of an RFQ is a **chat + live document
preview**, not a form to fill. The supplier talks to the Autofill Agent and/or
attaches documents; a preview of their quotation fills in as they go. Data is
still captured into the **fixed per-line table** (see the entry below) plus a
free-text **notes** area — the preview is only a presentation layer over that
table.

- **Two panes:** chat (left), document preview (right), notes area (below).
- **Colour = confidence**, per filled field: normal (high / supplier-confirmed),
  **amber** (AI-filled at medium/low confidence, *or* a defaulted assumption not
  yet corroborated), grey (optional field left blank). Every amber field carries
  a **rationale** pinned to it ("Assumed INR — RFQ currency, not stated in your
  docs"). Colour never means "blocking".
- **"Needs attention" list** (separate signal): a prominent, persistent panel
  with a warning icon and count, listing every **mandatory** field with **no
  value** — line-item blocking fields (`canSupply`, `unitPrice`, `currency`,
  `quotedUom`, minus any line marked `canSupply = no`), buyer-required
  quote-level fields, and buyer-required questionnaire items. Submit is blocked
  while it is non-empty.
- **System-inferred fields** — `canSupply`, `currency`, `quotedUom`,
  `availableQty` — are AI-defaulted; the supplier normally types nothing for
  them. `unitPrice` is always supplier-sourced; `leadTimeDays` / `moq` only when
  the buyer marked them required.
- **Highlight ↔ chat scoping:** clicking a preview highlight or a "needs
  attention" entry scrolls+rings the field, sets it as the **active chat
  context** (composer shows a chip "↳ Line 7 — unit of measure"), and focuses
  the composer. Typed text / attached docs are then understood as input for
  that field.
- **Preview is a templated rendering of the fixed table** — each field a tagged
  element (`data-field="line:<id>:unitPrice"`); *not* a free-form document with
  AI-returned character offsets.
- **Per-field rationale ≠ notes.** Rationale is structured provenance pinned to
  the field. Notes is a free-text area for supplier caveats the buyer should
  read.
- **Out of scope:** retiring the *buyer-side* RFQ form builder (same pattern,
  mirrored — later, separate change); FX conversion.

Full requirement: `rfq-system/REQUIREMENT_supplier-doc-preview.md`.

**Affects:** MASTER_SPEC §3 (Supplier Flow) — replaces the form-fill interaction;
Autofill Agent (adds per-field `confidence` + `rationale`); supplier
`/quote/[token]` UI; `line-response.ts` (adds `missingMandatory` + defaulting
helpers). No change to the buyer-side comparison / evaluation — same fixed table.
**Status:** in spec

## 2026-09-09 — Per-line supplier response is a fixed schema, not buyer-defined
**Refinement:** The fields a supplier fills **for each line item** are a fixed,
typed structure — the same on every RFQ — not something the buyer defines,
renames, or deletes in the form builder. This is what lets the quote-comparison
and NL-analysis agents reason over the responses structurally (normalise
currency/UoM, spot partial coverage) instead of guessing at free-form fields.

Per line item, every supplier answers:
- **Can supply?** — `full` / `partial` / `no` (explicit; a blank price no
  longer has to mean "declined")
- **Unit price** — number (blank if not quoting the line)
- **Quoted currency** — defaults to the RFQ currency; supplier can override
  per line (captures the "quoted in USD" case)
- **Quoted unit of measure** — e.g. *per piece*, *per 100*, *per box*, *per kg*
  (captures the "per box vs per 100 pieces" case; the agent normalises to the
  RFQ's asked unit)
- **Quantity they can supply** — number, defaults to the asked qty (captures
  "can only do 18k of the 22k asked")
- **Lead time (days)** — number
- **MOQ** — number, optional

**Form ≠ PDF.** The supplier response form is now a **superset** of the RFQ
document, not a 1:1 mirror of it. "Can you supply this item / this quantity"
belongs only in the form — it is a bid-capture concept, not something the buyer
states in the RFQ. The PDF's "Commercial information requested" section becomes
a **generated description** of this fixed grid; the form builder shows the grid
**read-only** (with a couple of optional-toggle rows), and drops
add/rename/delete of per-line commercial fields.

**What the buyer still defines freely:** the quality questionnaire, the header,
terms & conditions, and (new) any **quote-level** commercial fields answered
once for the whole quote (e.g. tooling charges, rebate tiers).

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ — form builder, RFQ document
structure §2), §4 (Quote comparison), §3 (Supplier flow); Drafting Agent
(stops emitting per-line commercial fields); Autofill Agent (targets the fixed
grid, per-cell confidence); `rfqDocumentToFormSchema`; supplier quote form;
comparison table columns; DB `quote_submissions.line_items` shape.
**Status:** in spec

**Design decisions (product owner):**
- Per-line response fields are fixed and typed; buyer customisation moves to
  the questionnaire and to new quote-level commercial fields.
- `canSupply` is explicit (`full`/`partial`/`no`), so the comparison never has
  to infer intent from a missing price.
- Currency and UoM are captured **per line**, defaulting to the RFQ's values.
- The form is a superset of the PDF; they are no longer two renderings of one
  identical structure.

## 2026-09-08 — Create RFQ opens straight into the chat (no policy picker)
**Refinement:** Clicking "Create RFQ" should redirect directly to the
create-RFQ chat page. The general-policy checkboxes that used to gate it are
removed — they don't apply anymore. Any policy the RFQ needs is attached as
a document in the chat like any other input.

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ — entry).
**Status:** implemented

## 2026-09-08 — Create RFQ: outline → confirm → apply on every (re)generation
**Refinement:** After the buyer supplies the relevant docs, the create-RFQ
chat follows this flow, repeated on **every** (re)generation until save & exit:
1. Buyer attaches docs / pastes content / gives context.
2. System replies in the chat with a **proposed outline** (not a regenerated
   RFQ), split into two groups:
   - **Supplier must provide** (Quotation): line items, commercial information
     requested, quality questionnaire, supporting documents.
   - **Buyer provides** (Terms & scope): scope & instructions, delivery,
     payment terms, quote validity, warranty/replacement, taxes & freight,
     penalties.
3. Sub-headings are **ticked by default**; buyer can untick to exclude. Buyer
   can **click a sub-heading** to see its already-drafted content in the chat
   (line-item table, exact questions, T&C text) — no new AI call. Buyer can
   also reply with changes → revised outline.
4. A **"Confirm & apply to RFQ"** button in the chat regenerates the RFQ
   (synced PDF + form builder) from the ticked sub-headings.

**Affects:** MASTER_SPEC §2 step 1 (Create RFQ); Drafting Agent (adds an
outline stage before the document).
**Status:** in spec

**Design decisions (product owner):**
- Outline-confirm flow repeats on every regeneration, not just the first.
- Sub-headings ticked by default; unticking excludes a section.
- Clicking a heading shows content drafted in the outline step — never a
  fresh Gemini call.
- Group labels: "Supplier must provide" / "Buyer provides".

## 2026-09-08 — Find & invite suppliers: show all first, filter/select inline
**Refinement:** Under "Find & invite suppliers", list **all suppliers
immediately**. The buyer can apply the existing filters (category, min
rating, exclude flagged, plus text search) — all client-side now — or just
multi-select from the full list and trigger the send. The AI pre-filtering
agent becomes **optional** ("Rank by fit with AI"): it ranks and annotates
the same list rather than gating it behind a required category + agent run.
Adds a select-all for the current filter.

**Affects:** MASTER_SPEC §2 step 2 (Find & invite suppliers); Pre-Filtering
Agent (now optional).
**Status:** implemented

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
