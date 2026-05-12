import type { User, Account, Income, Charge, Saving, Purchase, CalendarEvent, ShoppingItem, YearlyData, BalancePoint, ColockUser, Debt, Invoice } from './types';

export const today = new Date(2026, 4, 12); // 12 mai 2026

export const users: User[] = [
  { id: 1, name: 'Lucas', color: 'terra', initial: 'L' },
  { id: 2, name: 'Camille', color: 'sage', initial: 'C' },
  { id: 3, name: 'Naïm', color: 'plum', initial: 'N' },
];

export const me = users[0];

export const accounts: Account[] = [
  { id: 1, bank: 'Boursorama', type: 'Compte courant', name: 'Courant', initial_balance: 2840.50, color: 'ink', space: 'perso', members: [1] },
  { id: 2, bank: 'Livret A', type: 'Livret A', name: 'Livret A', initial_balance: 8200.00, color: 'sage', space: 'perso', members: [1] },
  { id: 3, bank: 'BoursoBank', type: 'PEA', name: 'PEA', initial_balance: 12450.30, color: 'plum', space: 'perso', members: [1] },
  { id: 4, bank: 'Joint Crédit Mutuel', type: 'Compte joint', name: 'Joint Coloc', initial_balance: 410.00, color: 'terra', space: 'perso', members: [1, 2, 3] },
  { id: 5, bank: 'Qonto', type: 'Compte pro', name: 'Pro — Lucas Studio', initial_balance: 5840.00, color: 'plum', space: 'pro', members: [1] },
  { id: 6, bank: 'Qonto', type: 'Provision URSSAF', name: 'Provision charges', initial_balance: 3120.00, color: 'sage', space: 'pro', members: [1] },
];

export const pro = {
  ca_ytd: 28400,
  ca_month: 4200,
  charges_month: 380,
  urssaf_provision: 22,
  tva_status: 'Franchise',
  accountant: { name: 'Cabinet Marval', monthly: 89, included: ['Bilan annuel', 'Liasse fiscale', 'TVA si dépassement', 'Conseil 1h/mois'] },
  invoices: [
    { id: 1, client: 'La Roche SAS', amount: 1200, status: 'payée' as const, date: '2026-05-04' },
    { id: 2, client: 'Studio Mer', amount: 1800, status: 'payée' as const, date: '2026-04-28' },
    { id: 3, client: 'Pixelmatic', amount: 1200, status: 'en attente' as const, date: '2026-05-10' },
  ] as Invoice[],
};

export const incomes: Income[] = [
  { id: 1, source: 'Salaire — Pixelmatic', amount: 2860, day: 27, account_id: 1, type: 'Régulier' },
  { id: 2, source: 'Freelance — La Roche', amount: 640, day: 15, account_id: 1, type: 'Variable' },
];

export const charges: Charge[] = [
  { id: 1, label: 'Loyer', total: 1320, day: 5, account_id: 4, split: 'Égal', shared: true, my_share: 440, payer_id: 1 },
  { id: 2, label: 'Électricité (EDF)', total: 96, day: 8, account_id: 4, split: 'Égal', shared: true, my_share: 32, payer_id: 2 },
  { id: 3, label: 'Internet — Free', amount: 39.99, total: 39.99, day: 12, account_id: 4, split: 'Égal', shared: true, my_share: 13.33, payer_id: 1 },
  { id: 4, label: 'Eau Veolia', total: 48, day: 20, account_id: 4, split: 'Égal', shared: true, my_share: 16, payer_id: 3 },
  { id: 5, label: 'Assurance habitation', total: 24, day: 3, account_id: 4, split: 'Égal', shared: true, my_share: 8, payer_id: 1 },
  { id: 6, label: 'Netflix', total: 17.99, day: 22, account_id: 1, split: 'Perso', shared: false, my_share: 17.99, payer_id: 1 },
  { id: 7, label: 'Mutuelle', total: 42.40, day: 6, account_id: 1, split: 'Perso', shared: false, my_share: 42.40, payer_id: 1 },
  { id: 8, label: 'Abonnement salle', total: 29.90, day: 14, account_id: 1, split: 'Perso', shared: false, my_share: 29.90, payer_id: 1 },
  { id: 9, label: 'Courses (commun)', total: 380, day: 28, account_id: 4, split: 'Égal', shared: true, my_share: 126.67, payer_id: 2 },
];

export const savings: Saving[] = [
  { id: 1, label: 'Vers Livret A', amount: 250, source_account_id: 1, dest_account_id: 2, day: 27 },
  { id: 2, label: 'PEA mensuel', amount: 150, source_account_id: 1, dest_account_id: 3, day: 27 },
];

export const purchases: Purchase[] = [
  { id: 1, date: '2026-05-04', desc: 'Casque Sony WH-1000XM5', total: 399, installments: 3, monthly: 133, category: 'Tech', account_id: 1 },
  { id: 2, date: '2026-04-22', desc: 'Vélo Decathlon', total: 540, installments: 4, monthly: 135, category: 'Mobilité', account_id: 1 },
  { id: 3, date: '2026-05-08', desc: 'Restaurant — anniv', total: 64, installments: 1, monthly: 64, category: 'Loisirs', account_id: 1 },
  { id: 4, date: '2026-05-10', desc: 'Plante Monstera', total: 38, installments: 1, monthly: 38, category: 'Maison', account_id: 1 },
];

export const monthly = {
  incomes: 3500,
  charges_perso: 90.29,
  charges_coloc: 636,
  savings: 400,
  purchases_imputed: 370,
  initial_balance: 23900.80,
  final_balance: 25904.51,
  available_for_purchases: 1003.71,
};

export const coloc = {
  users: users.slice(0, 3),
  by_user: [
    { user_id: 1, name: 'Lucas', total_due: 636.00, paid: 1383.99, balance: +747.99 },
    { user_id: 2, name: 'Camille', total_due: 636.00, paid: 476.00, balance: -160.00 },
    { user_id: 3, name: 'Naïm', total_due: 636.00, paid: 48.00, balance: -588.00 },
  ] as ColockUser[],
  debts: [
    { from: 3, to: 1, amount: 588.00 },
    { from: 2, to: 1, amount: 160.00 },
  ] as Debt[],
};

export const yearly: YearlyData[] = [
  { m: 'Jan', incomes: 3500, charges: 1690, savings: 400, purchases: 220, net: 1190 },
  { m: 'Fév', incomes: 3500, charges: 1640, savings: 400, purchases: 318, net: 1142 },
  { m: 'Mar', incomes: 3800, charges: 1720, savings: 400, purchases: 410, net: 1270 },
  { m: 'Avr', incomes: 3500, charges: 1660, savings: 400, purchases: 285, net: 1155 },
  { m: 'Mai', incomes: 3500, charges: 1640, savings: 400, purchases: 370, net: 1090 },
  { m: 'Juin', incomes: 4200, charges: 1620, savings: 400, purchases: 240, net: 1940 },
  { m: 'Juil', incomes: 3500, charges: 1730, savings: 400, purchases: 520, net: 850 },
  { m: 'Août', incomes: 3500, charges: 1650, savings: 400, purchases: 180, net: 1270 },
  { m: 'Sep', incomes: 3700, charges: 1700, savings: 400, purchases: 460, net: 1140 },
  { m: 'Oct', incomes: 3500, charges: 1640, savings: 400, purchases: 310, net: 1150 },
  { m: 'Nov', incomes: 3500, charges: 1650, savings: 400, purchases: 290, net: 1160 },
  { m: 'Déc', incomes: 4300, charges: 1820, savings: 400, purchases: 680, net: 1400 },
];

export function buildBalanceCurve(): BalancePoint[] {
  const start = 2840.50;
  const events = [
    { day: 3, delta: -24 },
    { day: 4, delta: -133 },
    { day: 5, delta: -440 },
    { day: 6, delta: -42.40 },
    { day: 8, delta: -32 },
    { day: 8, delta: -64 },
    { day: 10, delta: -38 },
    { day: 12, delta: -13.33 },
    { day: 14, delta: -29.90 },
    { day: 15, delta: 640 },
    { day: 16, delta: -135 },
    { day: 20, delta: -16 },
    { day: 22, delta: -17.99 },
    { day: 27, delta: 2860 },
    { day: 27, delta: -400 },
    { day: 28, delta: -126.67 },
  ];
  const days: BalancePoint[] = [];
  let bal = start;
  for (let d = 1; d <= 31; d++) {
    for (const e of events.filter(e => e.day === d)) bal += e.delta;
    days.push({ day: d, balance: +bal.toFixed(2) });
  }
  return days;
}

export const balanceCurve = buildBalanceCurve();

export const calendarEvents: CalendarEvent[] = [
  { date: 3, type: 'charge', label: 'Assurance habitation', amount: -8, account: 'Joint Coloc' },
  { date: 4, type: 'purchase', label: 'Casque Sony (1/3)', amount: -133, account: 'Courant' },
  { date: 5, type: 'charge', label: 'Loyer', amount: -440, account: 'Joint Coloc' },
  { date: 6, type: 'charge', label: 'Mutuelle', amount: -42.40, account: 'Courant' },
  { date: 8, type: 'charge', label: 'Électricité', amount: -32, account: 'Joint Coloc' },
  { date: 8, type: 'purchase', label: 'Restaurant anniv', amount: -64, account: 'Courant' },
  { date: 10, type: 'purchase', label: 'Plante Monstera', amount: -38, account: 'Courant' },
  { date: 12, type: 'charge', label: 'Internet — Free', amount: -13.33, account: 'Joint Coloc' },
  { date: 14, type: 'charge', label: 'Salle de sport', amount: -29.90, account: 'Courant' },
  { date: 15, type: 'income', label: 'Freelance — La Roche', amount: 640, account: 'Courant' },
  { date: 16, type: 'purchase', label: 'Vélo (2/4)', amount: -135, account: 'Courant' },
  { date: 20, type: 'charge', label: 'Eau Veolia', amount: -16, account: 'Joint Coloc' },
  { date: 22, type: 'charge', label: 'Netflix', amount: -17.99, account: 'Courant' },
  { date: 27, type: 'income', label: 'Salaire Pixelmatic', amount: 2860, account: 'Courant' },
  { date: 27, type: 'saving', label: 'Vers Livret A', amount: -250, account: 'Courant' },
  { date: 27, type: 'saving', label: 'Vers PEA', amount: -150, account: 'Courant' },
  { date: 28, type: 'charge', label: 'Courses communes', amount: -126.67, account: 'Joint Coloc' },
];

export const shopping: ShoppingItem[] = [
  { id: 1, label: 'Lait demi-écrémé', qty: '2L', category: 'Frigo', priority: 'normal', est: 2.40, bought: false, added_by: 'Camille' },
  { id: 2, label: 'Papier toilette', qty: '×12', category: 'Maison', priority: 'high', est: 8.90, bought: false, added_by: 'Lucas' },
  { id: 3, label: 'Pâtes complètes', qty: '1kg', category: 'Sec', priority: 'normal', est: 2.20, bought: true, added_by: 'Naïm', bought_by: 'Naïm' },
  { id: 4, label: 'Ampoules LED E27', qty: '×4', category: 'Maison', priority: 'low', est: 12.00, bought: false, added_by: 'Lucas' },
  { id: 5, label: 'Œufs bio', qty: '×12', category: 'Frigo', priority: 'urgent', est: 4.20, bought: false, added_by: 'Camille' },
  { id: 6, label: 'Café en grains', qty: '500g', category: 'Sec', priority: 'normal', est: 9.80, bought: false, added_by: 'Lucas' },
  { id: 7, label: 'Sac poubelle 50L', qty: '×30', category: 'Maison', priority: 'normal', est: 6.50, bought: true, added_by: 'Camille', bought_by: 'Lucas' },
  { id: 8, label: 'Yaourt grec', qty: '×8', category: 'Frigo', priority: 'normal', est: 3.40, bought: false, added_by: 'Naïm' },
  { id: 9, label: 'Liquide vaisselle', qty: '1L', category: 'Maison', priority: 'high', est: 3.60, bought: false, added_by: 'Camille' },
];
