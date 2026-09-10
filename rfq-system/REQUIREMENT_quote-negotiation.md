# Master Requirement — Review / negotiate a submitted quotation

**Status:** implemented (product owner, 2026-09-11). Builds on
`REQUIREMENT_supplier-doc-preview.md` and `REQUIREMENT_quote-via-email.md`.

---

## 1. Intent

After a supplier submits, the buyer may need the supplier to **change** the
quotation — either to clarify / complete it (**review**) or to improve terms
(**negotiation**). Today submission is one-shot and permanently locked; this
adds a controlled way to reopen it.

From the **Compare quotes** page the buyer opens one supplier's full submitted
quotation, clicks any response value to attach a comment, collects several
comments, and hits **one "Send to supplier" button**. The email reopens the
supplier's quotation for editing; the supplier edits (anything — no field lock
for the POC) and resubmits; the quotation locks again.

**AI classification (on send).** The buyer never picks review vs negotiation.
One Gemini call (`QuoteCommentAgent`) reads all the round's comments together
and tags each as:
- **review** — a clarification, a missing value, an answer that doesn't match
  what the RFQ asked, or information the supplier / the system skipped. No
  commercial demand.
- **negotiation** — a request to change a commercial term in the buyer's
  favour (lower price, shorter lead time, better payment terms, higher
  committed qty, dropped surcharge…). A comment that does both → negotiation.

The same call drafts the outbound copy, adapting to whether the round is
review-only, negotiation-only, or **both** (`roundKind`). The supplier's email
and in-app banner show the comments split into "Clarifications needed" and
"Points to negotiate".

**Fallback.** If the AI call fails, every comment is tagged `review`, the
generic review copy is used, the email is still sent, and the buyer sees a
notice that auto-classification didn't run.

No override, no threaded back-and-forth for the POC: the buyer writes, sends,
and the supplier edits and resubmits. Rounds are supported (comment → send →
resubmit → comment again → send…).

---

## 2. Data model

- `rfq_invitations.status` gains **`negotiating`** — set when a round is sent,
  cleared back to `submitted` when the supplier resubmits.
- `quote_submissions` gains **`revision`** (int, default 0) and **`revised_at`**.
  On resubmit the row is **overwritten in place** and `revision` is bumped —
  no version history for the POC. Comparison / evaluation always use the
  current row.
- `email_logs.type` gains **`quote_review`**, **`quote_negotiation`**,
  **`quote_revised`**.
- New table **`quote_comments`**:
  `id`, `rfq_invitation_id` (cascade), `round` (int), `field_id`, `field_label`,
  `quoted_value` (snapshot), `comment`, `intent` (`review`|`negotiation` —
  **set by the AI on send**, `review` while still open), `status`
  (`open`|`sent`|`addressed`), `created_by`, `created_at`, `sent_at`.
  - `field_id`: `line:<lineItemId>:<field>` (a per-line grid field), a
    buyer-defined form-field id, `line:<lineItemId>` (whole line), or
    `__quote` (overall).

Migration: `drizzle/quote-negotiation.sql` (additive; `npm run db:push` also
works).

---

## 3. Buyer flow

1. **Compare quotes** — each supplier column header links to
   `/dashboard/rfqs/[id]/quotes/[invitationId]`. A supplier in `negotiating`
   stays in the comparison (last submission shown) with an
   "out for review / negotiation" tag.
2. **Quote-detail page** renders that supplier's submitted quote read-only
   (`QuoteReviewDoc`). Every value is clickable → a comment box in the side
   panel. Comments accumulate as `status: 'open'`, editable / deletable.
3. **Send to supplier** (one button) — requires ≥1 open comment.
   `POST /api/rfqs/[id]/quotes/[invitationId]/send` (no body):
   - `QuoteCommentAgent.classifyAndDraft` tags each comment and drafts the copy
     (fallback: all `review`);
   - stamps each comment's own `intent` + `status: 'sent'` + `sent_at`;
   - `invitation.status → 'negotiating'`;
   - seeds a `quote_drafts` row from the submission (`draftFromSubmission`) so
     the supplier's link opens pre-filled and editable;
   - `sendQuoteNegotiationEmail` — AI-drafted subject / headline / intro, plus
     two sections ("Clarifications needed", "Points to negotiate"). Subject
     carries the `[ref: rfqId / token]` marker. `email_logs.type` is
     `quote_review` for a review-only round, otherwise `quote_negotiation`.
   - Response: `{ roundKind, review, negotiation, classificationFailed, emailSent }`.
4. Further comments after a send belong to the **next round**.

Award is never blocked. A supplier stuck in `negotiating` (never resubmitted)
is simply excluded from evaluation until they return to `submitted`
(`quote-eval-payload` filters on `status = 'submitted'`).

---

## 4. Supplier flow

1. `GET /api/quote/[token]` with `status = 'negotiating'` returns
   `submitted: false`, the `draft` (seeded from the submission), and
   `negotiation: { intent, round, comments[] }`.
2. `/quote/[token]` is **not locked**. A banner states the intent and lists the
   comments; each comment also shows as a `💬 buyer` marker pinned to its field
   in the preview.
3. The supplier edits anything and resubmits (existing `POST /api/quote/[token]`).
4. On resubmit during `negotiating`:
   - the existing `quote_submissions` row is **updated** (bump `revision`, set
     `revised_at`), not inserted;
   - that round's `sent` comments → `addressed`;
   - `invitation.status → 'submitted'`; draft deleted;
   - `sendQuoteRevisedEmail` notifies the buyer (RFQ creator) with a link to
     the quote-detail page.
5. **By email:** `processInboundEmail` already proceeds for `negotiating`
   (only `submitted` blocks). Its auto-submit path takes the same
   update-in-place branch and sends the buyer the revised-quote notice.

---

## 5. Out of scope (POC)

- Buyer override of the AI classification (fully automatic; no per-comment
  toggle).
- Threaded comment replies / supplier accept-counter-decline per comment.
- Per-field edit locking on resubmit (supplier can edit everything).
- Submission version history / before-after diff UI.
- Blocking award while a negotiation is open.
- Sequential-negotiation ethics controls (comments + rounds are logged, which
  is enough to defend an award later).

---

## 6. AI agent

`QuoteCommentAgent` (`src/lib/agents/quote-comment.ts`) — model
`gemini-flash-latest` (same chain as the others). Input: the round's raw
comments (+ field label, supplier's quoted value). Output: `{ classified:
[{id, intent, reason}], email: {subject, headline, intro} }`. Logged to
`ai_logs` as `agentType: 'evaluation'`. Non-fatal — a failure falls back to
all-`review` + generic copy.
