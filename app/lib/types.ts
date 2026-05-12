export interface User {
  id: number;
  name: string;
  color: 'terra' | 'sage' | 'plum' | 'ink';
  initial: string;
}

export interface Account {
  id: number;
  bank: string;
  type: string;
  name: string;
  initial_balance: number;
  color: string;
  space: 'perso' | 'pro';
  members: number[];
}

export interface Income {
  id: number;
  source: string;
  amount: number;
  day: number;
  account_id: number;
  type: string;
}

export interface Charge {
  id: number;
  label: string;
  total: number;
  day: number;
  account_id: number;
  split: string;
  shared: boolean;
  my_share: number;
  payer_id: number;
  amount?: number;
}

export interface Saving {
  id: number;
  label: string;
  amount: number;
  source_account_id: number;
  dest_account_id: number;
  day: number;
}

export interface Purchase {
  id: number;
  date: string;
  desc: string;
  total: number;
  installments: number;
  monthly: number;
  category: string;
  account_id: number;
}

export interface CalendarEvent {
  date: number;
  type: 'income' | 'charge' | 'saving' | 'purchase';
  label: string;
  amount: number;
  account: string;
}

export interface ShoppingItem {
  id: number;
  label: string;
  qty: string;
  category: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  est: number;
  bought: boolean;
  added_by: string;
  bought_by?: string;
}

export interface YearlyData {
  m: string;
  incomes: number;
  charges: number;
  savings: number;
  purchases: number;
  net: number;
}

export interface BalancePoint {
  day: number;
  balance: number;
}

export interface ColockUser {
  user_id: number;
  name: string;
  total_due: number;
  paid: number;
  balance: number;
}

export interface Debt {
  from: number;
  to: number;
  amount: number;
}

export interface Invoice {
  id: number;
  client: string;
  amount: number;
  status: 'payée' | 'en attente';
  date: string;
}

export interface TweakValues {
  theme: 'doux' | 'night' | 'sobre';
  accent: 'terra' | 'sage' | 'plum' | 'ink';
  serif_titles: boolean;
  animations: boolean;
  space: 'perso' | 'pro';
}
