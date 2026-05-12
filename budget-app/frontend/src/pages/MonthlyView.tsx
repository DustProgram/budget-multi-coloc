import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { CalendarEvent, EventType, UpcomingResponse } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Kpi, Loader, PageHeader, Pill,
} from '../components/ui';
import { BalanceCurve } from '../components/charts/BalanceCurve';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_LABEL: Record<EventType, string> = {
  income: 'Revenu', charge: 'Charge',
  transfer_in: 'Virement +', transfer_out: 'Virement −',
  saving_in: 'Épargne +', saving_out: 'Épargne −',
  purchase: 'Achat',
};

const TYPE_TONE: Record<EventType, 'sage' | 'rose' | 'plum' | 'amber'> = {
  income: 'sage', charge: 'rose',
  transfer_in: 'plum', transfer_out: 'plum',
  saving_in: 'plum', saving_out: 'plum',
  purchase: 'amber',
};

export function MonthlyView() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const query = useQuery({
    queryKey: ['upcoming', 'monthly', cursor.year, cursor.month],
    queryFn: async () =>
      (await api.get<UpcomingResponse>('/calendar/upcoming', { params: { days: 90 } })).data,
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const events = useMemo(() => {
    return (query.data?.events ?? [])
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

  // Build day-by-day balance curve for the month
  const curve = useMemo(() => {
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const points: { day: number; balance: number }[] = [];
    let running = 0;
    const byDay = new Map<number, CalendarEvent[]>();
    for (const e of events) {
      const d = Number(e.date.slice(8, 10));
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(e);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      for (const e of byDay.get(d) ?? []) running += num(e.amount);
      points.push({ day: d, balance: running });
    }
    return points;
  }, [events, cursor]);

  return (
    <>
      <PageHeader
        eyebrow="Vue mensuelle"
        title={`${MONTHS[cursor.month - 1]} ${cursor.year}`}
        subtitle={`${events.length} événement${events.length > 1 ? 's' : ''} sur le mois.`}
      >
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement." />}

      {query.data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <Kpi label="Entrées" value={eur(totals.income)} subClass="pos" />
            <Kpi label="Sorties" value={eur(totals.expense)} subClass="neg" />
            <Kpi label="Solde net" value={eur(totals.net)}
              subClass={totals.net >= 0 ? 'pos' : 'neg'} tinted />
          </div>

          {curve.length > 0 && (
            <Card style={{ marginBottom: 24 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Évolution journalière (cumul net)</div>
              <BalanceCurve data={curve} todayIndex={today.getDate() - 1} />
            </Card>
          )}

          {events.length === 0 && (
            <EmptyState message="Aucun événement prévu ce mois-ci." />
          )}

          {events.length > 0 && (
            <Card>
              <div className="card-title" style={{ marginBottom: 14 }}>
                Timeline des événements ({events.length})
              </div>
              <table className="t">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Libellé</th>
                    <th>Compte</th>
                    <th className="r">Montant</th>
                    <th className="r">Solde après</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e, i) => {
                    const amt = num(e.amount);
                    return (
                      <tr key={`${e.source_kind}-${e.source_id}-${i}`}>
                        <td className="muted small">{e.date.slice(8)} / {e.date.slice(5, 7)}</td>
                        <td><Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill></td>
                        <td><strong>{e.label}</strong></td>
                        <td className="muted small">{e.account_name}</td>
                        <td className={`r num display ${amt >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 16 }}>
                          {amt >= 0 ? '+' : ''}{eur(amt)}
                        </td>
                        <td className="r num muted">{eur(e.balance_after)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
