import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileText,
  ArrowLeftRight,
  PiggyBank,
  ShoppingBag,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { CalendarEvent, EventType, UpcomingResponse } from '../types';
import { Card, EmptyState, ErrorBox, Loader, PageHeader } from '../components/ui';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const TYPE_LABEL: Record<EventType, { label: string; icon: typeof TrendingUp; color: string }> = {
  income: { label: 'Revenu', icon: TrendingUp, color: 'text-emerald-600' },
  charge: { label: 'Charge', icon: FileText, color: 'text-rose-600' },
  transfer_in: { label: 'Virement +', icon: ArrowLeftRight, color: 'text-sky-600' },
  transfer_out: { label: 'Virement −', icon: ArrowLeftRight, color: 'text-sky-700' },
  saving_in: { label: 'Épargne +', icon: PiggyBank, color: 'text-violet-600' },
  saving_out: { label: 'Épargne −', icon: PiggyBank, color: 'text-violet-700' },
  purchase: { label: 'Achat', icon: ShoppingBag, color: 'text-orange-600' },
};

export function MonthlyView() {
  const today = new Date();
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }));

  // On fetche 60 jours en avance puis on filtre côté client pour ne garder que le mois affiché.
  const query = useQuery({
    queryKey: ['upcoming', 'monthly', cursor.year, cursor.month],
    queryFn: async () => {
      const { data } = await api.get<UpcomingResponse>('/calendar/upcoming', { params: { days: 90 } });
      return data;
    },
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const events = useMemo(() => {
    const all = query.data?.events ?? [];
    return all
      .filter((e) => {
        const [y, m] = e.date.split('-').map(Number);
        return y === cursor.year && m === cursor.month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [query.data, cursor]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const e of events) {
      const a = num(e.amount);
      if (a >= 0) income += a;
      else expense += a;
    }
    return { income, expense, net: income + expense };
  }, [events]);

  // Courbe : solde global cumulé jour après jour (en sommant les balance_after des derniers événements de chaque jour).
  const curve = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
    }
    let runningTotal = 0;
    return Array.from(byDate.entries()).map(([date, evs]) => {
      const delta = evs.reduce((acc, e) => acc + num(e.amount), 0);
      runningTotal += delta;
      return { date: date.slice(8), delta, cumulative: runningTotal };
    });
  }, [events]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader icon={<BarChart3 />} title="Vue mensuelle">
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded hover:bg-slate-100">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 text-sm font-medium min-w-[10rem] text-center">
            {MONTHS[cursor.month - 1]} {cursor.year}
          </span>
          <button onClick={() => shift(1)} className="p-1.5 rounded hover:bg-slate-100">
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement." />}

      {query.data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <Card>
              <p className="text-xs uppercase text-slate-500">Entrées</p>
              <p className="text-xl font-semibold text-emerald-600 tabular-nums">{eur(totals.income)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Sorties</p>
              <p className="text-xl font-semibold text-rose-600 tabular-nums">{eur(totals.expense)}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase text-slate-500">Solde net</p>
              <p
                className={`text-xl font-semibold tabular-nums ${
                  totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {eur(totals.net)}
              </p>
            </Card>
          </section>

          {curve.length > 0 && (
            <Card className="mb-6">
              <h3 className="text-sm font-semibold mb-3 text-slate-700">Évolution journalière (cumul net)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={curve}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1F4E79" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#1F4E79" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                  <Tooltip formatter={(v: number) => eur(v)} />
                  <Area dataKey="cumulative" stroke="#1F4E79" fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {events.length === 0 && <EmptyState message="Aucun événement prévu ce mois-ci." />}

          {events.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-xs uppercase text-slate-500 font-medium">
                Timeline des événements ({events.length})
              </div>
              <ul>
                {events.map((e, i) => {
                  const meta = TYPE_LABEL[e.type];
                  const Icon = meta.icon;
                  const amt = num(e.amount);
                  return (
                    <li
                      key={`${e.source_kind}-${e.source_id}-${i}`}
                      className="flex items-center gap-3 px-4 py-2 border-t border-slate-100"
                    >
                      <div className="text-xs text-slate-400 w-20 tabular-nums">
                        {e.date.slice(8)} / {e.date.slice(5, 7)}
                      </div>
                      <Icon size={14} className={meta.color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.label}</p>
                        <p className="text-xs text-slate-500 truncate">{e.account_name}</p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
                          amt >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {amt >= 0 ? '+' : ''}
                        {eur(amt)}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums w-24 text-right">
                        {eur(e.balance_after)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
