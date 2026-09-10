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
comments, and sends them in one go with one of two buttons — **Send for
Review** or **Send for Negotiation**. Either emails the supplier and reopens
their quotation for editing. The supplier edits (anything — no field lock for
the POC) and resubmits; the quotation locks again.

**Review vs Negotiation** are mechanically identical. They differ only in the
copy sent to the supplier and in the `intent` recorded per comment:
- **Review** — "we need clarification or completion" (a missing value, an
  answer that doesn't match what was asked, information the supplier or the AI
  skipped).
- **Negotiation** — "we'd like to revise terms" (price, lead time, payment
  terms…).

No threaded back-and-forth for the POC: the supplier just edits and resubmits.
Rounds are supported (comment → send → resubmit → comment again → send…).

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
  `quoted_value` (snapshot), `comment`, `intent` (`review`|`negotiation`),
  `status` (`open`|`sent`|`addressed`), `created_by`, `created_at`, `sent_at`.
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
3. **Send for Review** / **Send for Negotiation** — requires ≥1 open comment.
   `POST /api/rfqs/[id]/quotes/[invitationId]/send { intent }`:
   - stamps `intent` + `status: 'sent'` + `sent_at` on the round's comments;
   - `invitation.status → 'negotiating'`;
   - seeds a `quote_drafts` row from the submission (`draftFromSubmission`) so
     the supplier's link opens pre-filled and editable;
   - `sendQuoteNegotiationEmail` — one function, `intent` switches subject /
     heading / intro. Comments grouped by line / section. Subject carries the
     `[ref: rfqId / token]` marker.
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

- Threaded comment replies / supplier accept-counter-decline per comment.
- Per-field edit locking on resubmit (supplier can edit everything).
- Submission version history / before-after diff UI.
- Blocking award while a negotiation is open.
- Sequential-negotiation ethics controls (comments + rounds are logged, which
  is enough to defend an award later).
