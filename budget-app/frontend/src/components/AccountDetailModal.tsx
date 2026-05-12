import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import { Button, Pill } from './ui';
import type { Account, CalendarEvent, EventType, UpcomingResponse } from '../types';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_LABEL: Record<EventType, string> = {
  income: 'Revenu', charge: 'Charge',
  transfer_in: 'Vir. reçu', transfer_out: 'Vir. envoyé',
  saving_in: 'Épargne in', saving_out: 'Épargne out',
  purchase: 'Achat',
};
const TYPE_TONE: Record<EventType, 'sage' | 'rose' | 'plum' | 'amber'> = {
  income: 'sage', charge: 'rose',
  transfer_in: 'plum', transfer_out: 'plum',
  saving_in: 'plum', saving_out: 'plum',
  purchase: 'amber',
};

interface Props {
  account: Account;
  onClose: () => void;
}

export function AccountDetailModal({ account, onClose }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const query = useQuery({
    queryKey: ['account-detail', account.id],
    queryFn: async () =>
      (await api.get<UpcomingResponse>('/calendar/upcoming', { params: { days: 365 } })).data,
  });

  const monthEvents = useMemo(() => {
    return (query.data?.events ?? [])
      .filter((e) => e.account_id === account.id)
      .filter((e) => {
        const [y, m] = e.date.split('-').map(Number);
        return y === cursor.year && m === cursor.month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [query.data, cursor, account.id]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const e of monthEvents) {
      const a = num(e.amount);
      if (a >= 0) income += a;
      else expense += a;
    }
    return { income, expense, net: income + expense };
  }, [monthEvents]);

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)', padding: 24,
          width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div className="row between" style={{ marginBottom: 12 }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>{account.bank} · {account.type}</p>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 28, margin: '4px 0 0' }}>
              {account.name}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--bg-sunken)', border: '1px solid var(--line)',
            color: 'var(--ink-3)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        <div className="row gap-2" style={{ marginBottom: 16 }}>
          <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
          <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
          <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
        </div>

        <div className="grid" style={{
          gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16,
        }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="small muted">Entrées</div>
            <div className="num display pos" style={{ fontSize: 22 }}>{eur(totals.income)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="small muted">Sorties</div>
            <div className="num display neg" style={{ fontSize: 22 }}>{eur(totals.expense)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="small muted">Net</div>
            <div className={`num display ${totals.net >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 22 }}>
              {eur(totals.net)}
            </div>
          </div>
        </div>

        {monthEvents.length === 0 ? (
          <div className="muted small" style={{ padding: 24, textAlign: 'center' }}>
            Aucun mouvement sur ce compte pour {MONTHS[cursor.month - 1].toLowerCase()}.
          </div>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Libellé</th>
                <th className="r">Montant</th>
                <th className="r">Solde après</th>
              </tr>
            </thead>
            <tbody>
              {monthEvents.map((e: CalendarEvent, i) => {
                const amt = num(e.amount);
                return (
                  <tr key={i}>
                    <td className="muted small">{e.date.slice(8)} / {e.date.slice(5, 7)}</td>
                    <td><Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill></td>
                    <td><strong>{e.label}</strong></td>
                    <td className={`r num display ${amt >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 16 }}>
                      {amt >= 0 ? '+' : ''}{eur(amt)}
                    </td>
                    <td className="r num muted">{eur(e.balance_after)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
