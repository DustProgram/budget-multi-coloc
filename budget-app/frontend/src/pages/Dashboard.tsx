import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  PiggyBank,
  ShoppingBag,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { DashboardData } from '../types';
import { Card, EmptyState, ErrorBox, Loader, PageHeader } from '../components/ui';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function Dashboard() {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  const dash = useQuery({
    queryKey: ['dashboard', cursor.year, cursor.month],
    queryFn: async () => {
      const { data } = await api.get<DashboardData>('/dashboard/', {
        params: cursor,
      });
      return data;
    },
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const data = dash.data;

  const pieData = data
    ? [
        { name: 'Charges', value: num(data.total_charges), fill: '#f43f5e' },
        { name: 'Épargne', value: num(data.total_savings), fill: '#8b5cf6' },
        { name: 'Achats', value: num(data.total_purchases_imputed), fill: '#f97316' },
      ].filter((d) => d.value > 0)
    : [];

  const accountBars = (data?.accounts ?? []).map((a) => ({
    name: a.account_name,
    Initial: num(a.initial_balance),
    Final: num(a.final_balance),
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader icon={<LayoutDashboard />} title="Dashboard">
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Mois précédent">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 text-sm font-medium min-w-[10rem] text-center">
            {MONTHS[cursor.month - 1]} {cursor.year}
          </span>
          <button onClick={() => shift(1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Mois suivant">
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHeader>

      {dash.isLoading && <Loader />}
      {dash.isError && <ErrorBox message="Erreur de chargement du dashboard." />}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Kpi
              icon={<Wallet size={18} />}
              label="Solde final"
              value={eur(data.total_final_balance)}
              tone={num(data.total_final_balance) >= 0 ? 'positive' : 'negative'}
            />
            <Kpi
              icon={<TrendingUp size={18} />}
              label="Revenus"
              value={eur(data.total_incomes)}
              tone="positive"
            />
            <Kpi
              icon={<FileText size={18} />}
              label="Charges"
              value={eur(data.total_charges)}
              tone="negative"
            />
            <Kpi
              icon={<PiggyBank size={18} />}
              label="Épargne"
              value={eur(data.total_savings)}
              tone="violet"
            />
            <Kpi
              icon={<ShoppingBag size={18} />}
              label="Achats imputés"
              value={eur(data.total_purchases_imputed)}
              tone="orange"
            />
            <Kpi
              icon={<Wallet size={18} />}
              label="Dispo pour achats"
              value={eur(data.available_for_purchases)}
              tone={num(data.available_for_purchases) >= 0 ? 'positive' : 'negative'}
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <h3 className="text-sm font-semibold mb-3 text-slate-700">Répartition des dépenses</h3>
              {pieData.length === 0 ? (
                <p className="text-sm text-slate-500 py-12 text-center">Aucune dépense ce mois.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => eur(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-semibold mb-3 text-slate-700">Soldes par compte</h3>
              {accountBars.length === 0 ? (
                <p className="text-sm text-slate-500 py-12 text-center">Aucun compte.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={accountBars}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                    <Tooltip formatter={(v: number) => eur(v)} />
                    <Legend />
                    <Bar dataKey="Initial" fill="#94a3b8" />
                    <Bar dataKey="Final" fill="#1F4E79" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </section>

          {data.accounts.length === 0 ? (
            <EmptyState message="Aucun compte configuré. Va dans Comptes pour en créer." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-xs uppercase text-slate-500 font-medium">
                Détail par compte
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2">Compte</th>
                    <th className="text-right px-4 py-2">Initial</th>
                    <th className="text-right px-4 py-2">Revenus</th>
                    <th className="text-right px-4 py-2">Virements (net)</th>
                    <th className="text-right px-4 py-2">Charges</th>
                    <th className="text-right px-4 py-2">Épargne</th>
                    <th className="text-right px-4 py-2">Achats</th>
                    <th className="text-right px-4 py-2 bg-slate-50">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.account_id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <p className="font-medium">{a.account_name}</p>
                        <p className="text-xs text-slate-500">{a.bank}</p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{eur(a.initial_balance)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{eur(a.incomes)}</td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          num(a.transfers_net) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {eur(a.transfers_net)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-rose-600">−{eur(a.charges)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-violet-600">−{eur(a.savings)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-orange-600">−{eur(a.purchases)}</td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-semibold ${
                          num(a.final_balance) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {eur(a.final_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'violet' | 'orange';
}) {
  const toneClasses: Record<string, string> = {
    positive: 'text-emerald-600',
    negative: 'text-rose-600',
    violet: 'text-violet-600',
    orange: 'text-orange-600',
  };
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase text-slate-500">
        {icon} {label}
      </div>
      <p className={`text-lg font-semibold mt-1 tabular-nums ${toneClasses[tone]}`}>{value}</p>
    </Card>
  );
}
