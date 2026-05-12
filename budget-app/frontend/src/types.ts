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

export type Space = 'perso' | 'pro';

export interface Account {
  id: number;
  bank: string;
  type: AccountType;
  name: string;
  initial_balance: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  space: Space;
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
  user_id: number;
  valid_from: string | null;
  valid_to: string | null;
}

export const FREQUENCIES = [
  'Mensuelle',
  'Bimensuelle',
  'Trimestrielle',
  'Semestrielle',
  'Annuelle',
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SPLIT_MODES = ['Perso', 'Égal', 'Pourcentage', 'Montant fixe', 'Par utilisateur'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export interface ChargeSplit {
  id: number;
  user_id: number;
  amount: string;
  settled_at: string | null;
}

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
  // null quand la charge est payée par le compte joint (organisme externe)
  payer_user_id: number | null;
  splits: ChargeSplit[];
  valid_from: string | null;
  valid_to: string | null;
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
  user_id: number;
  valid_from: string | null;
  valid_to: string | null;
}

export interface OneTimeTransfer {
  id: number;
  date: string;
  label: string;
  source_account_id: number;
  dest_account_id: number;
  amount: string;
  notes: string | null;
  user_id: number;
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
  user_id: number;
  valid_from: string | null;
  valid_to: string | null;
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
  user_id: number;
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
  total_due: number;
  total_paid: number;
  balance: number;
  by_charge: ColocChargeLine[];
}

export interface ColocDebt {
  from_user_id: number;
  from_user_name: string;
  to_user_id: number;
  to_user_name: string;
  amount: number;
}

export interface ColocBreakdown {
  charges_lines: Array<{
    charge_id: number;
    label: string;
    total: number;
    per_person: Record<string, number>;
    split_mode: string;
    payer_user_id: number;
  }>;
  summaries: ColocSummaryEntry[];
  debts: ColocDebt[];
}

// ============================================================
// Membres de compte joint
// ============================================================

export interface AccountMember {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
  role: 'owner' | 'cotitulaire' | 'viewer';
  joined_at: string | null;
}

export interface UserPickerEntry {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
}

// ============================================================
// Custom events & messagerie
// ============================================================

export type CustomEventKind = 'perso' | 'coloc' | 'famille' | 'pro' | 'autre';

export interface CustomEvent {
  id: number;
  user_id: number;
  user_name: string | null;
  date: string;             // ISO yyyy-MM-dd
  label: string;
  kind: CustomEventKind;
  description: string | null;
  is_shared: boolean;
  account_id: number | null;
}

export interface Message {
  id: number;
  user_id: number;
  user_name: string | null;
  body: string;
  created_at: string;
}

export interface Me {
  user_id: number;
  ha_username: string;
  display_name: string | null;
  color_hex: string;
  is_admin: boolean;
  has_external_account: boolean;
  external_username: string | null;
  external_scope: 'coloc' | 'full' | null;
  pro_enabled: boolean;
  session_scope: 'coloc' | 'full';
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
