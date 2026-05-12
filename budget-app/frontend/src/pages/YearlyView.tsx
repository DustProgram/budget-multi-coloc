import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { DashboardData } from '../types';
import { Card, ErrorBox, Loader, PageHeader } from '../components/ui';

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export function YearlyView() {
  const [year, setYear] = useState(new Date().getFullYear());

  const query = useQuery({
    queryKey: ['dashboard', 'yearly', year],
    queryFn: async () => {
      const { data } = await api.get<DashboardData[]>('/dashboard/yearly', {
        params: { year },
      });
      return data;
    },
  });

  const chartData = (query.data ?? []).map((d) => ({
    month: MONTHS_SHORT[d.month - 1],
    Revenus: num(d.total_incomes),
    Charges: num(d.total_charges),
    Épargne: num(d.total_savings),
    Achats: num(d.total_purchases_imputed),
    Solde: num(d.total_final_balance),
  }));

  const totals = (query.data ?? []).reduce(
    (acc, d) => ({
      incomes: acc.incomes + num(d.total_incomes),
      charges: acc.charges + num(d.total_charges),
      savings: acc.savings + num(d.total_savings),
      purchases: acc.purchases + num(d.total_purchases_imputed),
    }),
    { incomes: 0, charges: 0, savings: 0, purchases: 0 },
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader icon={<BarChart3 />} title="Vue annuelle">
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1">
          <button onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded hover:bg-slate-100">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 text-sm font-medium min-w-[5rem] text-center">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="p-1.5 rounded hover:bg-slate-100">
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement." />}

      {query.data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <p className="text-xs uppercase text-slate-500">Revenus totaux</p>
              <p className="text-xl font-semibold text-emerald-600 tabular-nums">{eur(totals.incomes)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Charges totales</p>
              <p className="text-xl font-semibold text-rose-600 tabular-nums">{eur(totals.charges)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Épargné</p>
              <p className="text-xl font-semibold text-violet-600 tabular-nums">{eur(totals.savings)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Achats</p>
              <p className="text-xl font-semibold text-orange-600 tabular-nums">{eur(totals.purchases)}</p>
            </Card>
          </section>

          <Card className="mb-6">
            <h3 className="text-sm font-semibold mb-3 text-slate-700">Évolution mois par mois</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}€`} />
                <Tooltip formatter={(v: number) => eur(v)} />
                <Legend />
                <Bar dataKey="Revenus" fill="#10b981" />
                <Bar dataKey="Charges" fill="#f43f5e" />
                <Bar dataKey="Épargne" fill="#8b5cf6" />
                <Bar dataKey="Achats" fill="#f97316" />
                <Line dataKey="Solde" stroke="#1F4E79" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs uppercase text-slate-500 font-medium">
              Détail mensuel
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Mois</th>
                  <th className="text-right px-4 py-2">Revenus</th>
                  <th className="text-right px-4 py-2">Charges</th>
                  <th className="text-right px-4 py-2">Épargne</th>
                  <th className="text-right px-4 py-2">Achats</th>
                  <th className="text-right px-4 py-2 bg-slate-50">Solde final</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((d) => (
                  <tr key={d.month} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium">{MONTHS_SHORT[d.month - 1]}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{eur(d.total_incomes)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">−{eur(d.total_charges)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-violet-600">−{eur(d.total_savings)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-orange-600">−{eur(d.total_purchases_imputed)}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums font-semibold ${
                        num(d.total_final_balance) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {eur(d.total_final_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
