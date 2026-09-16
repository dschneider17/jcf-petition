-- Run automatically on server startup (see db.js). Safe to re-run.

CREATE TABLE IF NOT EXISTS signers (
  id                  SERIAL PRIMARY KEY,
  nonprofit_name      TEXT,
  signer_name         TEXT,
  signer_role         TEXT,
  email               TEXT,
  blurb               TEXT,
  wants_dafpay        BOOLEAN NOT NULL DEFAULT FALSE,
  wants_gift_processing BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | approved | hidden
  logo_url            TEXT,
  mission_statement   TEXT,
  website_url         TEXT,
  admin_note          TEXT,
  type                TEXT NOT NULL DEFAULT 'nonprofit', -- nonprofit | donor
  anonymous           BOOLEAN NOT NULL DEFAULT FALSE,
  years_as_account_holder TEXT, -- donor-only: 'Less than 1 year' | '1-5 years' | '5-10 years' | 'Greater than 10 years'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrations for databases created before these columns/constraints existed.
-- All idempotent — safe to run on every boot.
ALTER TABLE signers ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'nonprofit';
ALTER TABLE signers ADD COLUMN IF NOT EXISTS anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signers ADD COLUMN IF NOT EXISTS years_as_account_holder TEXT;
ALTER TABLE signers ALTER COLUMN nonprofit_name DROP NOT NULL;
ALTER TABLE signers ALTER COLUMN signer_name DROP NOT NULL;
ALTER TABLE signers ALTER COLUMN signer_role DROP NOT NULL;
ALTER TABLE signers ALTER COLUMN email DROP NOT NULL;
ALTER TABLE signers ALTER COLUMN blurb DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signers_status ON signers (status);
CREATE INDEX IF NOT EXISTS idx_signers_created_at ON signers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signers_type ON signers (type);

-- Session store table is created automatically by connect-pg-simple.
