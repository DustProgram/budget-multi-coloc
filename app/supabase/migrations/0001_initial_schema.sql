-- ============================================================
-- Compte Gestion — Initial Schema Migration
-- Run: supabase db push (or apply via Supabase dashboard)
-- ============================================================

-- Enums
CREATE TYPE space_kind AS ENUM ('perso', 'pro');
CREATE TYPE account_member_role AS ENUM ('owner', 'cotitulaire', 'viewer');
CREATE TYPE transaction_source AS ENUM ('manual', 'bank');
CREATE TYPE split_mode AS ENUM ('equal', 'shares', 'percent', 'perso');

-- users (mirrors auth.users — populated on first login)
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'terra',
  initial    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- spaces (perso / pro per user)
CREATE TABLE spaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       space_kind NOT NULL,
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- accounts
CREATE TABLE accounts (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                     UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  bank                         TEXT NOT NULL,
  type                         TEXT NOT NULL,
  name                         TEXT NOT NULL,
  iban                         TEXT,
  color                        TEXT NOT NULL DEFAULT 'terra',
  initial_balance              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency                     TEXT NOT NULL DEFAULT 'EUR',
  gocardless_requisition_id    TEXT,
  gocardless_account_id        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- account_members (key table for joint accounts)
CREATE TABLE account_members (
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        account_member_role NOT NULL DEFAULT 'viewer',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);

-- categories
CREATE TABLE categories (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  kind     TEXT NOT NULL,  -- income | charge | purchase
  color    TEXT NOT NULL DEFAULT 'terra',
  icon     TEXT
);

-- incomes
CREATE TABLE incomes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL,
  day         INT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Régulier',
  recurrence  TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- charges
CREATE TABLE charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  total       NUMERIC(12, 2) NOT NULL,
  day         INT NOT NULL,
  split_mode  split_mode NOT NULL DEFAULT 'perso',
  shared      BOOLEAN NOT NULL DEFAULT false,
  payer_id    UUID REFERENCES users(id),
  recurrence  TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- charge_splits (auto-populated by trigger on charge insert)
CREATE TABLE charge_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id   UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL,
  settled_at  TIMESTAMPTZ
);
CREATE INDEX charge_splits_charge_idx ON charge_splits(charge_id);

-- savings_rules
CREATE TABLE savings_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id   UUID NOT NULL REFERENCES accounts(id),
  dest_account_id     UUID NOT NULL REFERENCES accounts(id),
  amount              NUMERIC(12, 2) NOT NULL,
  day                 INT NOT NULL,
  label               TEXT NOT NULL,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- purchases
CREATE TABLE purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  desc         TEXT NOT NULL,
  total        NUMERIC(12, 2) NOT NULL,
  installments INT NOT NULL DEFAULT 1,
  monthly      NUMERIC(12, 2) NOT NULL,
  category_id  UUID REFERENCES categories(id),
  date         TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- transactions (manual + bank sync)
CREATE TABLE transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date                 TIMESTAMPTZ NOT NULL,
  amount               NUMERIC(12, 2) NOT NULL,
  label                TEXT NOT NULL,
  category_id          UUID REFERENCES categories(id),
  raw_payload          TEXT,
  source               transaction_source NOT NULL DEFAULT 'manual',
  bank_transaction_id  TEXT UNIQUE,  -- for dedup on bank sync
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_date_idx    ON transactions(date);
CREATE INDEX transactions_account_idx ON transactions(account_id);

-- households (coloc groups)
CREATE TABLE households (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- household_members
CREATE TABLE household_members (
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_pct     NUMERIC(5, 2) NOT NULL DEFAULT 33.33,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- shopping_items
CREATE TABLE shopping_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  qty           TEXT,
  category      TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal',
  est           NUMERIC(8, 2),
  bought_at     TIMESTAMPTZ,
  bought_by     UUID REFERENCES users(id),
  added_by      UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- invitations (for coloc + joint account onboarding)
CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID REFERENCES households(id) ON DELETE CASCADE,
  account_id    UUID REFERENCES accounts(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE,
  role          account_member_role NOT NULL DEFAULT 'cotitulaire',
  invited_by    UUID REFERENCES users(id),
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
