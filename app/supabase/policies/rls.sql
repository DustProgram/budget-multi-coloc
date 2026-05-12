-- ============================================================
-- Row Level Security Policies
-- A user sees only: their own data + data on accounts/households
-- where they are a member.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_splits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE households       ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations      ENABLE ROW LEVEL SECURITY;

-- ── users ──────────────────────────────────────────────────
CREATE POLICY "users: own row" ON users
  FOR ALL USING (id = auth.uid());

-- ── spaces ─────────────────────────────────────────────────
CREATE POLICY "spaces: own spaces" ON spaces
  FOR ALL USING (user_id = auth.uid());

-- ── accounts ───────────────────────────────────────────────
-- A user sees an account if they own the space OR are in account_members
CREATE POLICY "accounts: member or owner" ON accounts
  FOR SELECT USING (
    space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
    OR
    id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );

CREATE POLICY "accounts: insert own space" ON accounts
  FOR INSERT WITH CHECK (
    space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
  );

CREATE POLICY "accounts: update member or owner" ON accounts
  FOR UPDATE USING (
    space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
    OR
    id IN (
      SELECT account_id FROM account_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'cotitulaire')
    )
  );

CREATE POLICY "accounts: delete own space" ON accounts
  FOR DELETE USING (
    space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
  );

-- ── account_members ────────────────────────────────────────
CREATE POLICY "account_members: see own memberships" ON account_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "account_members: owner can manage" ON account_members
  FOR ALL USING (
    account_id IN (
      SELECT account_id FROM account_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- ── categories ─────────────────────────────────────────────
CREATE POLICY "categories: own spaces" ON categories
  FOR ALL USING (
    space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
  );

-- ── incomes ────────────────────────────────────────────────
CREATE POLICY "incomes: account member" ON incomes
  FOR ALL USING (
    account_id IN (
      SELECT id FROM accounts
      WHERE space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
      UNION
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ── charges ────────────────────────────────────────────────
CREATE POLICY "charges: account member" ON charges
  FOR ALL USING (
    account_id IN (
      SELECT id FROM accounts
      WHERE space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
      UNION
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ── charge_splits ──────────────────────────────────────────
CREATE POLICY "charge_splits: involved user" ON charge_splits
  FOR SELECT USING (
    user_id = auth.uid()
    OR
    charge_id IN (
      SELECT c.id FROM charges c
      JOIN account_members am ON am.account_id = c.account_id
      WHERE am.user_id = auth.uid()
    )
  );

CREATE POLICY "charge_splits: settle own splits" ON charge_splits
  FOR UPDATE USING (user_id = auth.uid());

-- ── savings_rules ──────────────────────────────────────────
CREATE POLICY "savings_rules: own accounts" ON savings_rules
  FOR ALL USING (
    source_account_id IN (
      SELECT id FROM accounts
      WHERE space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
    )
  );

-- ── purchases ──────────────────────────────────────────────
CREATE POLICY "purchases: account member" ON purchases
  FOR ALL USING (
    account_id IN (
      SELECT id FROM accounts
      WHERE space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
      UNION
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ── transactions ───────────────────────────────────────────
CREATE POLICY "transactions: account member" ON transactions
  FOR ALL USING (
    account_id IN (
      SELECT id FROM accounts
      WHERE space_id IN (SELECT id FROM spaces WHERE user_id = auth.uid())
      UNION
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
    )
  );

-- ── households ─────────────────────────────────────────────
CREATE POLICY "households: member" ON households
  FOR SELECT USING (
    id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- ── household_members ──────────────────────────────────────
CREATE POLICY "household_members: own household" ON household_members
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- ── shopping_items ─────────────────────────────────────────
CREATE POLICY "shopping_items: household member" ON shopping_items
  FOR ALL USING (
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- ── invitations ────────────────────────────────────────────
CREATE POLICY "invitations: own or invitee" ON invitations
  FOR SELECT USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "invitations: create if member" ON invitations
  FOR INSERT WITH CHECK (invited_by = auth.uid());
