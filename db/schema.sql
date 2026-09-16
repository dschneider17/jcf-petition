-- Run automatically on server startup (see db.js). Safe to re-run.

CREATE TABLE IF NOT EXISTS signers (
  id                  SERIAL PRIMARY KEY,
  nonprofit_name      TEXT NOT NULL,
  signer_name         TEXT NOT NULL,
  signer_role         TEXT NOT NULL,
  email               TEXT NOT NULL,
  blurb               TEXT NOT NULL,
  wants_dafpay        BOOLEAN NOT NULL DEFAULT FALSE,
  wants_gift_processing BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | approved | hidden
  logo_url            TEXT,
  mission_statement   TEXT,
  website_url         TEXT,
  admin_note          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signers_status ON signers (status);
CREATE INDEX IF NOT EXISTS idx_signers_created_at ON signers (created_at DESC);

-- Session store table is created automatically by connect-pg-simple.
