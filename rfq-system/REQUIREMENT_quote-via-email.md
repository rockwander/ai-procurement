# Master Requirement — Accept quotations via email

**Status:** proposed (product owner, 2026-09-09). Not yet in `MASTER_SPEC.md`.
Builds on `REQUIREMENT_supplier-doc-preview.md` (the chat + live document preview
supplier flow) and the fixed per-line response schema (2026-09-09).

---

## 1. Intent

A supplier should be able to respond to an RFQ **without opening the link** —
by simply **replying to the invitation email** with a free-text body and/or
attachments (their quotation PDF, price list, spec sheet, rate card — any
readable format).

The system ingests that reply, runs it through the **same Autofill Agent** the
`/quote/[token]` page uses, fills the fixed per-line table + buyer-defined
quote-level fields + questionnaire, and **replies to the supplier** telling them
exactly where their quotation stands:

- what was understood at low confidence (amber) and should be verified;
- what is still **blocking** (mandatory, missing);
- whether the quotation is **submitted** or **not yet submitted**.

The link (preview + chat) is always included so the supplier can finish there.

This is an **alternative entry path** to the existing supplier flow, not a
replacement. A quotation that lands by email is identical, downstream, to one
submitted through the link — same fixed table, same `quote_submissions` row,
same comparison and evaluation.

---

## 2. Inbound email

### 2.1 Transport

- **Resend inbound webhook.** Resend receives mail for a configured inbound
  address / domain and POSTs the parsed message (headers, text/html body,
  attachments) to a Next.js route: `POST /api/quote/inbound`.
- The route verifies the Resend webhook signature (shared secret in
  `RESEND_INBOUND_SECRET`) and returns `200` quickly; parsing + agent work
  happen inside the request (POC scale — one email at a time is fine).

### 2.2 Matching an email to an invitation

Two signals, **both** required:

1. **Token in the subject line.** The invitation email's subject carries the
   RFQ id and the invitation token in a stable, machine-readable marker, e.g.
   `RFQ: Corrugated Packaging  [ref: RFQ-2026-001 / <token>]`. On reply the
   subject is preserved (`Re: …`), so the route extracts the token with a
   regex.
2. **Sender email matches the invited supplier.** The `From` address must
   equal (case-insensitive) the `contact_email` of the supplier on that
   invitation.

Resolution:

| Situation | Action |
|---|---|
| Token found **and** sender matches | Process the email (§3). |
| Token found, sender does **not** match | Reply: "we could not match this reply to your invitation — please use your unique link". Do not process. |
| No token in subject | Reply with the same guidance. Do not process. |
| Token found but invitation already `submitted` | Reply: "a quotation has already been submitted for this RFQ; it cannot be changed by email". Do not process. |

No fuzzy fallback (no "look up open invitations for this sender"). The subject
marker is the contract.

### 2.3 What is read

- **Body:** the plain-text part (HTML stripped to text if that is all there is).
  Quoted trailer / signature is passed through as-is — the agent tolerates it.
- **Attachments:** each is parsed with the existing `extractText` (`.txt` /
  `.md` / `.csv` / `.pdf` / `.docx`). Unsupported types are skipped and named
  in the reply ("we couldn't read `quote.xlsx`"). Binaries are **not stored**,
  same as the link flow.
- Body text + every parsed attachment text become the Autofill Agent's
  `documentTexts`.

---

## 3. Processing an inbound email

1. Load the quote context for the token (RFQ, line items, form schema,
   supplier, currency, any existing draft state).
2. Seed line responses: existing draft if present, else defaults
   (system-inferred fields get their `isDefault` provenance, exactly as the
   page does on first open).
3. Run the **Autofill Agent** (`extractFormData`) over the body + attachment
   texts. Apply patches with `applyAgentPatches` → typed line-grid values,
   form-field values, and a provenance entry per written value.
4. **Persist the draft** so the link opens with everything already filled:
   - the merged line responses + form data + provenance are stored against the
     invitation (see §6 — draft persistence);
   - the email body is appended to the chat thread as a `user` message and the
     agent's summary as an `assistant` message (so the `/quote/[token]` chat
     shows the email as the first turn).
5. Compute two lists off the merged state:
   - **blockers** = `missingMandatory(...)` — the "needs attention" list;
   - **low-confidence** = every written field whose `fieldState` is `uncertain`
     or `assumed` (amber), with its rationale.
6. **Decide submission** (§4) and **send the response email** (§5).

---

## 4. Submission decision

| Condition | Outcome |
|---|---|
| `blockers.total === 0` **and** no **uncertain** amber field (AI extraction at medium/low confidence) | **Auto-submit.** Write the `quote_submissions` row exactly as the link POST does; set the invitation to `submitted`; the preview locks (one-shot, unchanged). |
| `blockers.total > 0` **or** any **uncertain** amber field | **Do not submit.** Leave the draft parked on `/quote/[token]`; the invitation stays `viewed` (or `sent`). |

**A bare system default does not block** (product-owner decision, 2026-09-10).
`currency = the RFQ currency` and `quotedUom = the asked unit` are `assumed`
(amber) until the supplier corroborates them — but they are the safe default
and the buyer sees them in the comparison regardless, so they do **not** hold
up an email auto-submit. They are still listed in the ack email's "please
verify" section for the supplier's awareness. Only a genuine AI extraction at
medium/low confidence (`uncertain`) blocks — that could be wrong, and one-shot
submission would freeze it in.

Without this carve-out, an emailed quote would essentially never auto-submit:
a supplier quoting in the RFQ's own currency and the asked unit never states
either explicitly, so both stay `assumed` forever.

---

## 5. The response email (always sent back to the supplier)

Sent from the same `EMApp` / `EMAIL_FROM` sender, `Re: <original subject>` (so
the token marker is preserved and a further reply still matches). Logged in
`email_logs` with a new `type` value `quote_ack`.

Every response email contains:

- A one-line status headline (submitted / not submitted).
- The **RFQ link** — `{APP_URL}/quote/{token}` — described as "open your
  quotation (preview + AI assistant)".
- If any attachment could not be read, a line naming it.

### 5.1 Auto-submitted

> **Your quotation has been submitted.**
> We read your email and everything needed was present and clear. Your
> quotation for *{RFQ title}* is now recorded and **locked** — it cannot be
> changed. You can review exactly what was submitted at the link below.

### 5.2 Not submitted — blockers present

> **Your quotation has NOT been submitted.**
> We read your email but some required information is still missing. Your
> quotation will not be considered until you open the link below and submit it.
>
> **Still needed:**
> - Line items: 3 *(unit price on lines 2, 5, 8)*
> - Quality questionnaire: 1 *(ISO 9001 certification)*
>
> Open the link, fill these in, and press Submit.

Blockers are grouped exactly as the "needs attention" panel groups them
(`line-items` / `commercial` / `questionnaire`), with the per-item labels.

### 5.3 Not submitted — low-confidence only (no blockers)

> **Your quotation is ready but NOT yet submitted.**
> We filled in everything from your email, but a few values are assumptions we
> need you to confirm. Open the link below, check the highlighted fields, and
> press Submit.
>
> **Please verify:**
> - Line 3 currency — *assumed INR (your RFQ's currency); your email didn't state one*
> - Line 7 unit of measure — *assumed "per piece" from the asked unit*

### 5.4 Both blockers and low-confidence

Show both sections ("Still needed" then "Please verify"), headline is the
blocker headline ("NOT been submitted").

---

## 6. Draft persistence

The link flow today holds the in-progress quote **only in React state** — there
is no server-side draft. Accepting email requires the draft to survive so the
supplier opens the link and sees their emailed data already there.

- Add a nullable `draft` jsonb column to `quote_submissions`… **no.** A
  submission row means "submitted". Instead add a small **`quote_drafts`**
  table keyed by `rfq_invitation_id` (one row, upserted):
  `{ lineResponses, formData, notes, provenance, updatedAt, source }`
  where `source` is `email` or `link`.
- `GET /api/quote/[token]` returns the draft (if any, and not yet submitted)
  alongside the RFQ; the page seeds its state from it instead of from blank
  defaults.
- The chat route and a new lightweight `PATCH /api/quote/[token]/draft`
  (called by the page as the supplier edits) keep the draft row current, so a
  supplier can go email → link → email again without losing work.
- On submit, the draft row is deleted.

POC scale: ≤20 RFQs, a handful of suppliers each — this table stays tiny.

---

## 7. Out of scope

- Threading / conversation state in the inbox beyond "match the token, append
  to the chat thread".
- Multiple suppliers emailing from one address, or one supplier from several
  addresses — the sender must match `contact_email`.
- Spreadsheet attachments (`.xlsx`) — named as unreadable in the reply.
- Any buyer-facing indication of *how* a quote arrived beyond what
  `quote_submissions` already shows (could add a `source` later).
- FX conversion (unchanged — flagged, never converted).

---

## 7a. POC: Supplier Mailbox simulator (no mail domain)

Real inbound email needs a verified domain + MX records. For the POC we skip
that and simulate the supplier's inbox in-app.

- **`email_logs`** gains `body_html` + `attachments` (`[{filename, bytes}]`);
  every outbound sender now stores the rendered HTML.
- **`/dashboard/mailbox`** (buyer-authed) lists every outbound email, renders
  the stored body, and on any email carrying a `[ref:]` marker offers
  **"Reply as <supplier>"**: a body textarea + file attach. The "from" address
  is forced to the supplier's `contact_email`.
- **`POST /api/mailbox/reply`** builds the same payload shape Resend inbound
  would deliver (attachments base64-encoded) and calls the shared
  **`processInboundEmail(payload, appUrl)`** — no signature check (trusted,
  authed, in-app). The supplier's reply and the system's ack both land back in
  the mailbox list, so the round-trip is visible.
- The real webhook (`POST /api/quote/inbound`) is unchanged — it verifies the
  signature then calls the same `processInboundEmail`.

This is POC scaffolding, not part of the product surface — a real deployment
would use the webhook and a domain.

## 8. Build checklist

1. **DB:** `quote_drafts` table; `email_logs.type` gains `quote_ack`;
   migration.
2. **`quote-access.ts`:** load + expose the draft row.
3. **`GET /api/quote/[token]`:** return the draft; **`PATCH …/draft`:** upsert
   it; delete on submit (in the existing POST).
4. **Page:** seed state from the draft; debounced PATCH on change.
5. **`email.ts`:** `sendQuoteAckEmail(...)` with the three body variants;
   invitation subject gains the `[ref: <rfqId> / <token>]` marker
   (`sendRFQEmail` + the reminder email).
6. **`lib/inbound-email.ts`:** signature check, token extraction, sender match,
   attachment parsing → `documentTexts`.
7. **`POST /api/quote/inbound`:** the webhook — match, process (§3), decide
   (§4), reply (§5).
8. **`lib/quote-ack.ts`:** given merged state + schema + line items, compute
   `{ blockers, lowConfidence, decision }` — shared by the webhook (and unit
   tested).
9. Env: `RESEND_INBOUND_SECRET`, inbound address in `EMAIL_INBOUND` /
   documented Resend setup.
