import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ListOrdered, ChevronLeft, ChevronRight, Pencil, Trash2,
  TrendingUp, FileText, ArrowLeftRight, PiggyBank, ShoppingBag,
} from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { useSpaceAccountIdsSet } from '../lib/useSpaceAccounts';
import { useUsersDirectory } from '../lib/useUsersDirectory';
import {
  Button, Card, EmptyState, Loader, PageHeader, Pill, Select,
} from '../components/ui';
import type {
  Account, Charge, Income, OneTimeTransfer, Purchase,
  RecurringTransfer, Saving,
} from '../types';

type EventKind = 'income' | 'charge' | 'rec_transfer' | 'ot_transfer' | 'saving' | 'purchase';

interface EventRow {
  key: string;
  kind: EventKind;
  day: number;            // jour du mois où l'événement intervient
  label: string;
  amount: number;         // positif = entrée, négatif = sortie (depuis le POV utilisateur)
  account_id: number;
  account_name: string;
  user_id: number | null;
  source_id: number;
  raw_date?: string;      // pour ponctuels : date ISO réelle
  is_in_validity?: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function inValidityWindow(
  validFrom: string | null, validTo: string | null,
  year: number, month: number,
): boolean {
  const target = new Date(year, month - 1, 1).getTime();
  const targetEnd = new Date(year, month, 1).getTime();
  if (validFrom) {
    const vf = new Date(validFrom).getTime();
    if (vf >= targetEnd) return false;
  }
  if (validTo) {
    const vt = new Date(validTo).getTime();
    if (vt < target) return false;
  }
  return true;
}

const TYPE_META: Record<EventKind, { label: string; tone: 'sage' | 'rose' | 'plum' | 'amber' | 'terra'; icon: React.ReactNode }> = {
  income: { label: 'Revenu', tone: 'sage', icon: <TrendingUp size={12} /> },
  charge: { label: 'Charge', tone: 'rose', icon: <FileText size={12} /> },
  rec_transfer: { label: 'Virement', tone: 'plum', icon: <ArrowLeftRight size={12} /> },
  ot_transfer: { label: 'Virement ponctuel', tone: 'plum', icon: <ArrowLeftRight size={12} /> },
  saving: { label: 'Épargne', tone: 'plum', icon: <PiggyBank size={12} /> },
  purchase: { label: 'Achat', tone: 'amber', icon: <ShoppingBag size={12} /> },
};

const editPath: Record<EventKind, (id: number) => string> = {
  income: (id) => `/incomes?edit=${id}`,
  charge: (id) => `/charges?edit=${id}`,
  rec_transfer: (id) => `/transfers?edit=${id}&editKind=recurring`,
  ot_transfer: (id) => `/transfers?edit=${id}&editKind=onetime`,
  saving: (id) => `/savings?edit=${id}`,
  purchase: (id) => `/purchases?edit=${id}`,
};

const deletePath: Record<EventKind, (id: number) => string> = {
  income: (id) => `/incomes/${id}`,
  charge: (id) => `/charges/${id}`,
  rec_transfer: (id) => `/transfers/recurring/${id}`,
  ot_transfer: (id) => `/transfers/onetime/${id}`,
  saving: (id) => `/savings/${id}`,
  purchase: (id) => `/purchases/${id}`,
};

export function Events() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [filter, setFilter] = useState<'all' | EventKind>('all');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const spaceAccounts = useSpaceAccountIdsSet();
  const users = useUsersDirectory();

  const accounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  const incomes = useQuery({
    queryKey: ['incomes'],
    queryFn: async () => (await api.get<Income[]>('/incomes/')).data,
  });
  const charges = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get<Charge[]>('/charges/')).data,
  });
  const recTransfers = useQuery({
    queryKey: ['transfers', 'recurring'],
    queryFn: async () => (await api.get<RecurringTransfer[]>('/transfers/recurring/')).data,
  });
  const otTransfers = useQuery({
    queryKey: ['transfers', 'onetime'],
    queryFn: async () => (await api.get<OneTimeTransfer[]>('/transfers/onetime/')).data,
  });
  const savings = useQuery({
    queryKey: ['savings'],
    queryFn: async () => (await api.get<Saving[]>('/savings/')).data,
  });
  const purchases = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => (await api.get<Purchase[]>('/purchases/')).data,
  });

  const accById = new Map((accounts.data ?? []).map((a) => [a.id, a]));
  const isLoading =
    accounts.isLoading || incomes.isLoading || charges.isLoading
    || recTransfers.isLoading || otTransfers.isLoading
    || savings.isLoading || purchases.isLoading;

  const rows: EventRow[] = useMemo(() => {
    const max = daysInMonth(year, month);
    const result: EventRow[] = [];
    const accFilter = (id: number | null) => id !== null && spaceAccounts.idsSet.has(id);

    (incomes.data ?? []).forEach((i) => {
      if (!accFilter(i.account_id) || !i.is_active) return;
      if (!inValidityWindow(i.valid_from, i.valid_to, year, month)) return;
      const day = Math.min(i.day_of_month, max);
      result.push({
        key: `inc-${i.id}`, kind: 'income', day,
        label: i.source, amount: num(i.amount),
        account_id: i.account_id!, account_name: accById.get(i.account_id!)?.name ?? '',
        user_id: i.user_id, source_id: i.id,
      });
    });

    (charges.data ?? []).forEach((c) => {
      if (!accFilter(c.account_id) || !c.is_active) return;
      if (!inValidityWindow(c.valid_from, c.valid_to, year, month)) return;
      // Pour les non-mensuelles, ne montrer que le mois cible
      if (c.frequency !== 'Mensuelle' && c.month !== null && c.month !== month) return;
      const day = Math.min(c.day_of_month, max);
      result.push({
        key: `chg-${c.id}`, kind: 'charge', day,
        label: c.label, amount: -num(c.my_share || c.total_amount),
        account_id: c.account_id!, account_name: accById.get(c.account_id!)?.name ?? '',
        user_id: c.payer_user_id ?? null, source_id: c.id,
      });
    });

    (recTransfers.data ?? []).forEach((t) => {
      if (!t.is_active) return;
      if (!accFilter(t.source_account_id) && !accFilter(t.dest_account_id)) return;
      if (!inValidityWindow(t.valid_from, t.valid_to, year, month)) return;
      if (t.frequency !== 'Mensuelle' && t.frequency !== 'Bimensuelle') {
        // skip non-mensuelles pour la première version, simplification
      }
      const day = Math.min(t.day_of_month, max);
      result.push({
        key: `rec-${t.id}`, kind: 'rec_transfer', day,
        label: t.label, amount: -num(t.amount),
        account_id: t.source_account_id, account_name:
          `${accById.get(t.source_account_id)?.name ?? ''} → ${accById.get(t.dest_account_id)?.name ?? ''}`,
        user_id: t.user_id, source_id: t.id,
      });
    });

    (otTransfers.data ?? []).forEach((t) => {
      const d = new Date(t.date);
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
      if (!accFilter(t.source_account_id) && !accFilter(t.dest_account_id)) return;
      result.push({
        key: `ot-${t.id}`, kind: 'ot_transfer', day: d.getDate(),
        label: t.label, amount: -num(t.amount),
        account_id: t.source_account_id, account_name:
          `${accById.get(t.source_account_id)?.name ?? ''} → ${accById.get(t.dest_account_id)?.name ?? ''}`,
        user_id: t.user_id, source_id: t.id, raw_date: t.date,
      });
    });

    (savings.data ?? []).forEach((s) => {
      if (!s.is_active) return;
      if (!accFilter(s.source_account_id) && !accFilter(s.dest_account_id)) return;
      if (!inValidityWindow(s.valid_from, s.valid_to, year, month)) return;
      const day = Math.min(s.day_of_month, max);
      result.push({
        key: `sav-${s.id}`, kind: 'saving', day,
        label: s.label, amount: -num(s.amount),
        account_id: s.source_account_id, account_name:
          `${accById.get(s.source_account_id)?.name ?? ''} → ${accById.get(s.dest_account_id)?.name ?? ''}`,
        user_id: s.user_id, source_id: s.id,
      });
    });

    (purchases.data ?? []).forEach((p) => {
      const d = new Date(p.date);
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;
      if (!accFilter(p.account_id)) return;
      result.push({
        key: `pur-${p.id}`, kind: 'purchase', day: d.getDate(),
        label: p.description, amount: -num(p.total_amount),
        account_id: p.account_id!, account_name: accById.get(p.account_id!)?.name ?? '',
        user_id: p.user_id, source_id: p.id, raw_date: p.date,
      });
    });

    return result.sort((a, b) => a.day - b.day);
  }, [
    year, month,
    accounts.data, incomes.data, charges.data,
    recTransfers.data, otTransfers.data, savings.data, purchases.data,
    spaceAccounts.idsSet,
  ]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.kind === filter);

  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: EventKind; id: number }) =>
      api.delete(deletePath[kind](id)),
    onSuccess: (_d, { kind }) => {
      qc.invalidateQueries({ queryKey: ['charges'] });
      qc.invalidateQueries({ queryKey: ['incomes'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['savings'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['coloc'] });
      void kind;
    },
  });

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } else { setMonth(month - 1); }
  };
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } else { setMonth(month + 1); }
  };

  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const totalIn = filtered.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalOut = filtered.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Événements"
        title="Vue chronologique"
        subtitle={`Tous les mouvements de ${monthLabel} dans l'ordre du mois.`}
      >
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <Button onClick={prevMonth}><ChevronLeft size={14} /></Button>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{monthLabel}</strong>
          <Button onClick={nextMonth}><ChevronRight size={14} /></Button>
        </div>
      </PageHeader>

      <div className="row gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | EventKind)}>
          <option value="all">Tous les types</option>
          <option value="income">Revenus</option>
          <option value="charge">Charges</option>
          <option value="rec_transfer">Virements récurrents</option>
          <option value="ot_transfer">Virements ponctuels</option>
          <option value="saving">Épargne</option>
          <option value="purchase">Achats</option>
        </Select>
        <Pill tone="sage">{eur(totalIn)} entrées</Pill>
        <Pill tone="rose">{eur(Math.abs(totalOut))} sorties</Pill>
      </div>

      {isLoading && <Loader />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<ListOrdered size={26} />}
          title="Aucun événement"
          message={`Pas de mouvement prévu pour ${monthLabel}.`}
        />
      )}

      {filtered.length > 0 && (
        <Card>
          <table className="t">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Type</th>
                <th>Libellé</th>
                <th>Compte</th>
                <th>Par</th>
                <th className="r">Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = TYPE_META[r.kind];
                return (
                  <tr key={r.key}>
                    <td><strong>{r.day}</strong></td>
                    <td>
                      <Pill tone={meta.tone}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {meta.icon} {meta.label}
                        </span>
                      </Pill>
                    </td>
                    <td><strong>{r.label}</strong></td>
                    <td className="muted small">{r.account_name}</td>
                    <td className="muted small">{users.display(r.user_id)}</td>
                    <td
                      className={`r num display ${r.amount >= 0 ? 'pos' : 'neg'}`}
                      style={{ fontSize: 16 }}
                    >
                      {r.amount >= 0 ? '+' : '−'}{eur(Math.abs(r.amount))}
                    </td>
                    <td className="r">
                      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                        <Button variant="sm" onClick={() => navigate(editPath[r.kind](r.source_id))} title="Modifier">
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="sm"
                          onClick={() => {
                            if (confirm(`Supprimer "${r.label}" ?`)) remove.mutate({ kind: r.kind, id: r.source_id });
                          }}
                          title="Supprimer"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
