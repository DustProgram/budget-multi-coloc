export type EventType =
  | 'income'
  | 'charge'
  | 'transfer_in'
  | 'transfer_out'
  | 'saving_in'
  | 'saving_out'
  | 'purchase';

export type SourceKind =
  | 'income'
  | 'charge'
  | 'recurring_transfer'
  | 'onetime_transfer'
  | 'saving'
  | 'purchase';

export interface CalendarEvent {
  date: string;
  type: EventType;
  label: string;
  amount: string;
  account_id: number;
  account_name: string;
  source_kind: SourceKind;
  source_id: number;
  balance_after: string;
}

export interface AccountProjection {
  account_id: number;
  name: string;
  starting_balance: string;
  projected_end_balance: string;
}

export interface UpcomingResponse {
  from_date: string;
  to_date: string;
  events: CalendarEvent[];
  accounts: AccountProjection[];
}

// ============================================================
// Entités CRUD
// ============================================================

export const ACCOUNT_TYPES = [
  'Compte courant',
  'Livret A',
  'LDDS',
  'LEP',
  'PEL',
  'CEL',
  'PEA',
  'Assurance vie',
  'Compte joint',
  'Compte épargne',
  'Compte titres',
  'Autre',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  id: number;
  bank: string;
  type: AccountType;
  name: string;
  initial_balance: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export const INCOME_TYPES = ['Régulier', 'Ponctuel', 'Variable'] as const;
export type IncomeTypeName = (typeof INCOME_TYPES)[number];

export interface Income {
  id: number;
  source: string;
  amount: string;
  day_of_month: number;
  type: IncomeTypeName;
  account_id: number | null;
  notes: string | null;
  is_active: boolean;
}

export const FREQUENCIES = [
  'Mensuelle',
  'Bimensuelle',
  'Trimestrielle',
  'Semestrielle',
  'Annuelle',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SPLIT_MODES = ['Perso', 'Égal', 'Pourcentage', 'Montant fixe'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export interface Charge {
  id: number;
  label: string;
  total_amount: string;
  frequency: Frequency;
  day_of_month: number;
  month: number | null;
  split_mode: SplitMode;
  num_colocs: number;
  split_value: string | null;
  account_id: number | null;
  is_shared: boolean;
  notes: string | null;
  is_active: boolean;
  my_share: string;
}

export interface RecurringTransfer {
  id: number;
  label: string;
  source_account_id: number;
  dest_account_id: number;
  amount: string;
  day_of_month: number;
  frequency: Frequency;
  is_active: boolean;
  notes: string | null;
}

export interface OneTimeTransfer {
  id: number;
  date: string;
  label: string;
  source_account_id: number;
  dest_account_id: number;
  amount: string;
  notes: string | null;
}

export interface Saving {
  id: number;
  label: string;
  amount: string;
  source_account_id: number;
  dest_account_id: number;
  day_of_month: number;
  is_active: boolean;
  notes: string | null;
}

export const PAYMENT_METHODS = [
  'CB',
  'Virement',
  'Espèces',
  'Chèque',
  'Prélèvement',
  'Autre',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Purchase {
  id: number;
  date: string;
  description: string;
  total_amount: string;
  nb_installments: number;
  monthly_amount: string;
  category: string | null;
  payment_method: PaymentMethod;
  account_id: number | null;
  notes: string | null;
}

// ============================================================
// Dashboard / Simulator / Coloc
// ============================================================

export interface DashboardAccount {
  account_id: number;
  account_name: string;
  bank: string;
  initial_balance: string;
  incomes: string;
  transfers_net: string;
  charges: string;
  savings: string;
  purchases: string;
  final_balance: string;
}

export interface DashboardData {
  user_id: number;
  year: number;
  month: number;
  total_incomes: string;
  total_charges: string;
  total_savings: string;
  total_purchases_imputed: string;
  total_initial_balance: string;
  total_final_balance: string;
  available_for_purchases: string;
  accounts: DashboardAccount[];
}

export interface SimulationResult {
  can_afford_global: boolean;
  can_afford_account: boolean;
  available_before: string;
  available_after: string;
  account_balance_after: string | null;
  final_balance_before: string;
  final_balance_after: string;
  verdict_message: string;
}

export interface ColocChargeLine {
  charge_id: number;
  label: string;
  total: string;
  split_mode: string;
  my_share: string | null;
}

export interface ColocSummaryEntry {
  year: number;
  month: number;
  user_id: number;
  user_name: string;
  total_due: string;
  by_charge: ColocChargeLine[];
  owes_to: Record<string, string>;
}

export interface ColocBreakdown {
  charges_lines: Array<{
    charge_id: number;
    label: string;
    total: string;
    per_person: Record<string, string>;
    split_mode: string;
    payer_user_id: number;
  }>;
  summaries: ColocSummaryEntry[];
  debts: Record<string, Record<string, string>>;
}

// ============================================================
// Shopping
// ============================================================

export type ShoppingPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ShoppingItem {
  id: number;
  label: string;
  quantity: string | null;
  category: string | null;
  priority: ShoppingPriority;
  estimated_price: string | null;
  actual_price: string | null;
  is_bought: boolean;
  bought_at: string | null;
  bought_by_user_id: number | null;
  bought_by_name: string | null;
  added_by_user_id: number;
  added_by_name: string | null;
  created_at: string;
  notes: string | null;
}
