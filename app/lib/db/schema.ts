import {
  pgTable, uuid, text, integer, numeric, boolean,
  timestamp, pgEnum, unique, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────────────────

export const spaceKindEnum = pgEnum('space_kind', ['perso', 'pro']);
export const accountMemberRoleEnum = pgEnum('account_member_role', ['owner', 'cotitulaire', 'viewer']);
export const transactionSourceEnum = pgEnum('transaction_source', ['manual', 'bank']);
export const splitModeEnum = pgEnum('split_mode', ['equal', 'shares', 'percent', 'perso']);

// ── Tables ─────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  color: text('color').notNull().default('terra'),  // terra | sage | plum | ink
  initial: text('initial').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: spaceKindEnum('kind').notNull(),
  label: text('label').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  space_id: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  bank: text('bank').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  iban: text('iban'),
  color: text('color').notNull().default('terra'),
  initial_balance: numeric('initial_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('EUR'),
  // GoCardless
  gocardless_requisition_id: text('gocardless_requisition_id'),
  gocardless_account_id: text('gocardless_account_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accountMembers = pgTable('account_members', {
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: accountMemberRoleEnum('role').notNull().default('viewer'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: unique('account_members_pk').on(t.account_id, t.user_id),
}));

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  space_id: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').notNull(),  // income | charge | purchase
  color: text('color').notNull().default('terra'),
  icon: text('icon'),
});

export const incomes = pgTable('incomes', {
  id: uuid('id').primaryKey().defaultRandom(),
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  day: integer('day').notNull(),  // day of month 1-31
  type: text('type').notNull().default('Régulier'),
  recurrence: text('recurrence'),  // RRULE string
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const charges = pgTable('charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  day: integer('day').notNull(),
  split_mode: splitModeEnum('split_mode').notNull().default('perso'),
  shared: boolean('shared').notNull().default(false),
  payer_id: uuid('payer_id').references(() => users.id),
  recurrence: text('recurrence'),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chargeSplits = pgTable('charge_splits', {
  id: uuid('id').primaryKey().defaultRandom(),
  charge_id: uuid('charge_id').notNull().references(() => charges.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  settled_at: timestamp('settled_at', { withTimezone: true }),
}, (t) => ({
  idx: index('charge_splits_charge_idx').on(t.charge_id),
}));

export const savingsRules = pgTable('savings_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  source_account_id: uuid('source_account_id').notNull().references(() => accounts.id),
  dest_account_id: uuid('dest_account_id').notNull().references(() => accounts.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  day: integer('day').notNull(),
  label: text('label').notNull(),
  active: boolean('active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  desc: text('desc').notNull(),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  installments: integer('installments').notNull().default(1),
  monthly: numeric('monthly', { precision: 12, scale: 2 }).notNull(),
  category_id: uuid('category_id').references(() => categories.id),
  date: timestamp('date', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  date: timestamp('date', { withTimezone: true }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  label: text('label').notNull(),
  category_id: uuid('category_id').references(() => categories.id),
  raw_payload: text('raw_payload'),  // JSON from bank API
  source: transactionSourceEnum('source').notNull().default('manual'),
  bank_transaction_id: text('bank_transaction_id').unique(),  // for dedup
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  dateIdx: index('transactions_date_idx').on(t.date),
  accountIdx: index('transactions_account_idx').on(t.account_id),
}));

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable('household_members', {
  household_id: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  share_pct: numeric('share_pct', { precision: 5, scale: 2 }).notNull().default('33.33'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: unique('household_members_pk').on(t.household_id, t.user_id),
}));

export const shoppingItems = pgTable('shopping_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  household_id: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  qty: text('qty'),
  category: text('category'),
  priority: text('priority').notNull().default('normal'),  // urgent | high | normal | low
  est: numeric('est', { precision: 8, scale: 2 }),
  bought_at: timestamp('bought_at', { withTimezone: true }),
  bought_by: uuid('bought_by').references(() => users.id),
  added_by: uuid('added_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Polymorphic: link to either a household or an account
  household_id: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
  account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  role: accountMemberRoleEnum('role').notNull().default('cotitulaire'),
  invited_by: uuid('invited_by').references(() => users.id),
  accepted_at: timestamp('accepted_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  spaces: many(spaces),
  accountMembers: many(accountMembers),
  householdMembers: many(householdMembers),
  chargeSplits: many(chargeSplits),
}));

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  user: one(users, { fields: [spaces.user_id], references: [users.id] }),
  accounts: many(accounts),
  categories: many(categories),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  space: one(spaces, { fields: [accounts.space_id], references: [spaces.id] }),
  members: many(accountMembers),
  incomes: many(incomes),
  charges: many(charges),
  transactions: many(transactions),
  purchases: many(purchases),
}));

export const chargesRelations = relations(charges, ({ one, many }) => ({
  account: one(accounts, { fields: [charges.account_id], references: [accounts.id] }),
  splits: many(chargeSplits),
  payer: one(users, { fields: [charges.payer_id], references: [users.id] }),
}));

export const chargeSplitsRelations = relations(chargeSplits, ({ one }) => ({
  charge: one(charges, { fields: [chargeSplits.charge_id], references: [charges.id] }),
  user: one(users, { fields: [chargeSplits.user_id], references: [users.id] }),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  shoppingItems: many(shoppingItems),
}));
