-- Quote review / negotiation round (REQUIREMENT_quote-negotiation.md).
-- Additive only — safe to run against the existing Neon database.
-- Apply with:  psql "$DATABASE_URL" -f drizzle/quote-negotiation.sql
--   (or paste into the Neon SQL editor)

BEGIN;

-- 1. New invitation status. Drizzle stores enums as plain text + a CHECK
--    constraint; adjust to match however the column is currently constrained.
--    If there is no CHECK constraint (Drizzle text columns often have none),
--    nothing to do here — 'negotiating' is just another string value.
--    This block drops and recreates the constraint if one exists.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'rfq_invitations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE rfq_invitations DROP CONSTRAINT %I', c);
    ALTER TABLE rfq_invitations
      ADD CONSTRAINT rfq_invitations_status_check
      CHECK (status IN ('sent','viewed','submitted','declined','negotiating'));
  END IF;
END $$;

-- 2. quote_submissions: revision tracking (overwrite-in-place model).
ALTER TABLE quote_submissions
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE quote_submissions
  ADD COLUMN IF NOT EXISTS revised_at timestamp;

-- 3. email_logs.type: three new values, same CHECK-constraint dance.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'email_logs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_logs DROP CONSTRAINT %I', c);
    ALTER TABLE email_logs
      ADD CONSTRAINT email_logs_type_check
      CHECK (type IN (
        'rfq_invitation','reminder','purchase_order','quote_ack',
        'quote_review','quote_negotiation','quote_revised'
      ));
  END IF;
END $$;

-- 4. quote_comments — the buyer's per-field notes for a review / negotiation round.
CREATE TABLE IF NOT EXISTS quote_comments (
  id                text PRIMARY KEY,
  rfq_invitation_id text NOT NULL REFERENCES rfq_invitations(id) ON DELETE CASCADE,
  round             integer NOT NULL DEFAULT 1,
  field_id          text NOT NULL,
  field_label       text NOT NULL,
  quoted_value      text,
  comment           text NOT NULL,
  intent            text NOT NULL DEFAULT 'review',
  status            text NOT NULL DEFAULT 'open',
  created_by        text NOT NULL REFERENCES users(id),
  created_at        timestamp NOT NULL DEFAULT now(),
  sent_at           timestamp
);

CREATE INDEX IF NOT EXISTS quote_comments_invitation_idx
  ON quote_comments (rfq_invitation_id);

COMMIT;
