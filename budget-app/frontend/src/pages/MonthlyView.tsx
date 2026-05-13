import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, CalendarEvent, EventType, UpcomingResponse } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Kpi, Loader, PageHeader, Pill, Select,
} from '../components/ui';
import { BalanceCurve } from '../components/charts/BalanceCurve';

type AccountFilter = 'all' | 'perso' | 'joint' | number;

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_LABEL: Record<EventType, string> = {
  income: 'Revenu', charge: 'Charge',
  transfer_in: 'Virement +', transfer_out: 'Virement −',
  saving_in: 'Épargne +', saving_out: 'Épargne −',
  purchase: 'Achat',
  expected_in: 'Abondement attendu',
};

const TYPE_TONE: Record<EventType, 'sage' | 'rose' | 'plum' | 'amber'> = {
  income: 'sage', charge: 'rose',
  transfer_in: 'plum', transfer_out: 'plum',
  saving_in: 'plum', saving_out: 'plum',
  purchase: 'amber',
  expected_in: 'sage',
};

type ViewMode = 'flux' | 'compte';

export function MonthlyView() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [mode, setMode] = useState<ViewMode>('flux');

  const query = useQuery({
    queryKey: ['upcoming', 'monthly', 1095],
    queryFn: async () =>
      (await api.get<UpcomingResponse>('/calendar/upcoming', { params: { days: 1095 } })).data,
  });
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  // Pour le solde cumulé (mode 'compte') : 1 seul fetch sur /balance_at
  // qui retourne le cumul des deltas mensuels précédents (3 ans d'historique
  // par défaut, configurable). Bien plus léger que les 4× /dashboard/yearly.
  const balanceAtQ = useQuery({
    queryKey: ['dashboard', 'balance_at', cursor.year, cursor.month],
    queryFn: async () =>
      (await api.get<{
        balance_at_start: number;
        base_balance: number;
        cumul_delta: number;
      }>('/dashboard/balance_at', { params: { year: cursor.year, month: cursor.month } })).data,
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  // Set des account_ids qui matchent le filtre courant.
  // 'perso' = compte solo (PAS de type "Compte joint"). Un compte que j'ai créé
  // mais qui est en réalité partagé (type Compte joint) n'est pas perso : il
  // appartient à tous ses co-titulaires.
  const filteredAccountIds = useMemo(() => {
    const all = accountsQ.data ?? [];
    if (filter === 'all') return new Set(all.map((a) => a.id));
    if (filter === 'perso') {
      return new Set(
        all.filter((a) => a.type !== 'Compte joint').map((a) => a.id),
      );
    }
    if (filter === 'joint') {
      return new Set(all.filter((a) => a.type === 'Compte joint').map((a) => a.id));
    }
    // filter is a specific account id
    return new Set([filter as number]);
  }, [filter, accountsQ.data]);

  const events = useMemo(() => {
    return (query.data?.events ?? [])
      .filter((e) => {
        const [y, m] = e.date.split('-').map(Number);
        return y === cursor.year && m === cursor.month;
      })
      .filter((e) => filteredAccountIds.has(e.account_id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [query.data, cursor, filteredAccountIds]);

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
        <Select
          value={typeof filter === 'number' ? String(filter) : filter}
          onChange={(e) => {
            const v = e.target.value;
            setFilter(v === 'all' || v === 'perso' || v === 'joint' ? v : Number(v));
          }}
          style={{ minWidth: 180 }}
        >
          <option value="all">Tous les comptes</option>
          <option value="perso">Comptes perso</option>
          <option value="joint">Comptes joints</option>
          <option disabled>──────────</option>
          {(accountsQ.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
          ))}
        </Select>
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement." />}

      {query.data && (() => {
        const accs = accountsQ.data ?? [];
        const filteredAccs = accs.filter((a) => filteredAccountIds.has(a.id));
        // Solde au début du mois = endpoint optimisé balance_at.
        // (Note : le filtre par compte n'est pas appliqué côté endpoint, il
        // retourne le cumul global. Filtrer côté front sur une partie de
        // l'historique est complexe ; pour l'instant on accepte que le mode
        // 'compte' considère tous les comptes pour le cumul historique.)
        const currentBalance = balanceAtQ.data?.balance_at_start
          ?? filteredAccs.reduce((s, a) => s + num(a.initial_balance), 0);
        const endBalance = currentBalance + totals.net;
        return (
        <>
          <div className="row gap-2" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
            <Button
              variant={mode === 'flux' ? 'primary' : 'default'}
              onClick={() => setMode('flux')}
            >
              Flux du mois
            </Button>
            <Button
              variant={mode === 'compte' ? 'primary' : 'default'}
              onClick={() => setMode('compte')}
            >
              Solde du compte
            </Button>
          </div>
          <div className="grid kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            {mode === 'flux' ? (
              <>
                <Kpi label="Entrées" value={eur(totals.income)} subClass="pos" />
                <Kpi label="Sorties" value={eur(totals.expense)} subClass="neg" />
                <Kpi label="Solde net" value={eur(totals.net)}
                  subClass={totals.net >= 0 ? 'pos' : 'neg'} tinted />
              </>
            ) : (
              <>
                <Kpi label="Solde actuel" value={eur(currentBalance)}
                  sub={`${filteredAccs.length} compte${filteredAccs.length > 1 ? 's' : ''}`} />
                <Kpi label="Sorties du mois" value={eur(totals.expense)} subClass="neg" />
                <Kpi label="Solde fin de mois" value={eur(endBalance)}
                  subClass={endBalance >= 0 ? 'pos' : 'neg'} tinted
                  sub={`${totals.net >= 0 ? '+' : ''}${eur(totals.net)} net`} />
              </>
            )}
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
        );
      })()}
    </>
  );
}
