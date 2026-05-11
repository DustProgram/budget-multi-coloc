import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  TrendingUp,
  FileText,
  ArrowLeftRight,
  PiggyBank,
  ShoppingBag,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../lib/api';
import type { CalendarEvent, EventType, UpcomingResponse } from '../types';

const RANGES = [
  { days: 30, label: '30 j' },
  { days: 60, label: '60 j' },
  { days: 90, label: '3 mois' },
  { days: 180, label: '6 mois' },
];

const TYPE_META: Record<
  EventType,
  { color: string; label: string; icon: LucideIcon }
> = {
  income: { color: 'bg-emerald-500', label: 'Revenu', icon: TrendingUp },
  charge: { color: 'bg-rose-500', label: 'Charge', icon: FileText },
  transfer_in: { color: 'bg-sky-500', label: 'Virement entrant', icon: ArrowLeftRight },
  transfer_out: { color: 'bg-sky-700', label: 'Virement sortant', icon: ArrowLeftRight },
  saving_in: { color: 'bg-violet-500', label: 'Épargne reçue', icon: PiggyBank },
  saving_out: { color: 'bg-violet-700', label: 'Épargne sortante', icon: PiggyBank },
  purchase: { color: 'bg-orange-500', label: 'Achat', icon: ShoppingBag },
};

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

function fmt(v: string | number): string {
  return eur.format(typeof v === 'string' ? Number(v) : v);
}

export function Calendar() {
  const [days, setDays] = useState(60);
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());

  const query = useQuery({
    queryKey: ['calendar', 'upcoming', days],
    queryFn: async () => {
      const { data } = await api.get<UpcomingResponse>('/calendar/upcoming', {
        params: { days },
      });
      return data;
    },
  });

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of query.data?.events ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [query.data]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const grid = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  const selectedKey = format(selected, 'yyyy-MM-dd');
  const selectedEvents = byDate.get(selectedKey) ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-brand" />
          <h2 className="text-2xl font-bold">Calendrier des événements</h2>
        </div>
        <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                days === r.days
                  ? 'bg-brand text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {query.isLoading && <p className="text-slate-500">Chargement…</p>}
      {query.isError && (
        <p className="text-rose-600">Erreur de chargement des événements.</p>
      )}

      {query.data && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {query.data.accounts.map((a) => {
              const start = Number(a.starting_balance);
              const end = Number(a.projected_end_balance);
              const delta = end - start;
              return (
                <div
                  key={a.account_id}
                  className="bg-white rounded-lg shadow-sm p-4"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {a.name}
                  </p>
                  <p className="text-2xl font-semibold mt-1">{fmt(end)}</p>
                  <p
                    className={`text-sm mt-1 ${
                      delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {delta >= 0 ? '+' : ''}
                    {fmt(delta)} sur la période
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    départ : {fmt(start)}
                  </p>
                </div>
              );
            })}
            {query.data.accounts.length === 0 && (
              <p className="text-sm text-slate-500 col-span-full">
                Aucun compte actif. Ajoute des comptes pour voir les projections.
              </p>
            )}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCursor(addMonths(cursor, -1))}
                  className="p-1 rounded hover:bg-slate-100"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft size={18} />
                </button>
                <h3 className="text-lg font-semibold capitalize">
                  {format(cursor, 'MMMM yyyy', { locale: fr })}
                </h3>
                <button
                  onClick={() => setCursor(addMonths(cursor, 1))}
                  className="p-1 rounded hover:bg-slate-100"
                  aria-label="Mois suivant"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-1">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {grid.map((d) => {
                  const key = format(d, 'yyyy-MM-dd');
                  const events = byDate.get(key) ?? [];
                  const isCur = isSameMonth(d, cursor);
                  const isToday = isSameDay(d, today);
                  const isSel = isSameDay(d, selected);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(d)}
                      className={`aspect-square flex flex-col items-stretch p-1 text-sm rounded relative transition ${
                        isSel
                          ? 'bg-brand text-white'
                          : isToday
                            ? 'bg-amber-50 ring-1 ring-amber-300'
                            : 'hover:bg-slate-100'
                      } ${!isCur ? 'opacity-40' : ''}`}
                    >
                      <span
                        className={`font-medium text-left ${
                          isSel
                            ? ''
                            : isToday
                              ? 'text-amber-700'
                              : ''
                        }`}
                      >
                        {format(d, 'd')}
                      </span>
                      {events.length > 0 && (
                        <div className="flex gap-0.5 mt-auto flex-wrap justify-center pb-0.5">
                          {events.slice(0, 4).map((e, i) => (
                            <span
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${TYPE_META[e.type].color}`}
                              title={`${TYPE_META[e.type].label} — ${e.label}`}
                            />
                          ))}
                          {events.length > 4 && (
                            <span
                              className={`text-[10px] leading-none ${
                                isSel ? 'text-white' : 'text-slate-500'
                              }`}
                            >
                              +{events.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {(Object.keys(TYPE_META) as EventType[]).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${TYPE_META[t].color}`}
                    />
                    {TYPE_META[t].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="font-semibold capitalize mb-3">
                {format(selected, 'EEEE d MMMM yyyy', { locale: fr })}
              </h3>
              {selectedEvents.length === 0 && (
                <p className="text-sm text-slate-500">
                  Aucun événement ce jour-là.
                </p>
              )}
              {selectedEvents.length > 0 && (
                <ul className="space-y-3">
                  {selectedEvents.map((e, i) => {
                    const meta = TYPE_META[e.type];
                    const Icon = meta.icon;
                    const amt = Number(e.amount);
                    return (
                      <li
                        key={i}
                        className="border border-slate-200 rounded-md p-3"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`p-1.5 rounded-md text-white ${meta.color} flex-shrink-0`}
                          >
                            <Icon size={14} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {e.label}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {e.account_name}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-semibold whitespace-nowrap ${
                              amt >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {amt >= 0 ? '+' : ''}
                            {fmt(amt)}
                          </span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs text-slate-500">
                            Solde du compte après ce mouvement
                          </span>
                          <span className="text-base font-semibold tabular-nums">
                            {fmt(e.balance_after)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
