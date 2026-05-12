import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Download, ChevronLeft, ChevronRight, Check, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, Charge, ColocBreakdown } from '../types';

interface ContributionRow {
  user_id: number;
  user_name: string;
  expected: string;
  actual: string;
  balance: string;
}
import {
  Button, Card, EmptyState, ErrorBox, Loader, PageHeader, Pill,
} from '../components/ui';
import { Avatar } from '../components/Avatar';
import { ColocChat } from '../components/ColocChat';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export function ColocSummary() {
  const qc = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const breakdown = useQuery({
    queryKey: ['coloc', cursor.year, cursor.month],
    queryFn: async () => (await api.get<ColocBreakdown>('/coloc/breakdown', { params: cursor })).data,
  });
  const charges = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get<Charge[]>('/charges/')).data,
  });
  const allAccounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  const jointAccounts = (allAccounts.data ?? []).filter((a) => a.type === 'Compte joint');
  // Le chat est désormais lié au foyer (configurable dans Réglages),
  // pas à un compte joint spécifique.

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const data = breakdown.data;
  const total = data?.summaries.reduce((s, x) => s + x.total_due, 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={`Coloc · ${MONTHS[cursor.month - 1]} ${cursor.year}`}
        title="Qui doit quoi à qui."
        subtitle={data ? `${eur(total)} de charges partagées · ${data.debts.length === 0 ? 'tout est soldé' : `${data.debts.length} virement${data.debts.length > 1 ? 's' : ''} pour solder`}.` : '—'}
      >
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
      </PageHeader>

      {breakdown.isLoading && <Loader />}
      {breakdown.isError && <ErrorBox message="Erreur de chargement." />}

      {data && data.summaries.length === 0 && jointAccounts.length === 0 && (
        <EmptyState
          icon={<Users size={26} />}
          title="Pas encore de charges partagées"
          message="Crée un compte joint, ajoute des membres, puis saisis des charges en mode Égal / Pourcentage / Montant fixe."
        />
      )}

      {/* Abondements par compte joint — modèle "qui a abondé combien" */}
      {jointAccounts.length > 0 && (
        <div className="grid" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          marginBottom: 24,
        }}>
          {jointAccounts.map((acc) => (
            <JointContributionsCard
              key={acc.id} account={acc}
              year={cursor.year} month={cursor.month}
            />
          ))}
        </div>
      )}

      {data && data.debts.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Flux de remboursement</div>
              <div className="card-sub">{data.debts.length} virement{data.debts.length > 1 ? 's' : ''} pour solder le mois</div>
            </div>
          </div>
          <div style={{ padding: '24px 0' }}>
            {data.debts.map((d, i) => (
              <div key={i} className="flow" style={{ position: 'relative' }}>
                <div className="row gap-3" style={{ minWidth: 140 }}>
                  <Avatar user={{ display_name: d.from_user_name }} size={44} />
                  <div>
                    <div className="display" style={{ fontSize: 20 }}>{d.from_user_name}</div>
                    <div className="small muted">doit</div>
                  </div>
                </div>
                <div className="flow-arrow">
                  <span className="flow-amount num">{eur(d.amount)}</span>
                </div>
                <div className="row gap-3" style={{ minWidth: 140, justifyContent: 'flex-end' }}>
                  <div className="right">
                    <div className="display" style={{ fontSize: 20 }}>{d.to_user_name}</div>
                    <div className="small muted">reçoit</div>
                  </div>
                  <Avatar user={{ display_name: d.to_user_name }} size={44} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data && data.summaries.length > 0 && (
        <div className="grid" style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginBottom: 24,
        }}>
          {data.summaries.map((s) => (
            <Card key={s.user_id}>
              <div className="row between" style={{ marginBottom: 12 }}>
                <div className="row gap-3">
                  <Avatar user={{ display_name: s.user_name }} size={36} />
                  <div>
                    <div className="display" style={{ fontSize: 22 }}>{s.user_name}</div>
                  </div>
                </div>
                <Pill tone={s.balance > 0 ? 'sage' : s.balance < 0 ? 'rose' : undefined}>
                  {s.balance > 0 ? 'Créditeur' : s.balance < 0 ? 'Débiteur' : 'Réglé'}
                </Pill>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div className="eyebrow">Dû</div>
                  <div className="num display" style={{ fontSize: 22 }}>{eur(s.total_due)}</div>
                </div>
                <div>
                  <div className="eyebrow">Payé</div>
                  <div className="num display" style={{ fontSize: 22 }}>{eur(s.total_paid)}</div>
                </div>
              </div>
              <div className="divider" style={{ margin: '12px 0' }} />
              <div className="row between">
                <span className="small muted">Solde</span>
                <span className={`num display ${s.balance > 0 ? 'pos' : s.balance < 0 ? 'neg' : ''}`} style={{ fontSize: 26 }}>
                  {s.balance > 0 ? `+${eur(s.balance)}` : eur(s.balance)}
                </span>
              </div>
              <Button
                style={{ marginTop: 10, width: '100%' }}
                onClick={async () => {
                  const url = `${api.defaults.baseURL}/coloc/pdf?year=${cursor.year}&month=${cursor.month}&user_id=${s.user_id}`;
                  window.open(url, '_blank');
                }}
              >
                <Download size={14} /> Exporter PDF
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Discussion du foyer (configurée dans Réglages → Mon foyer) */}
      <div style={{ marginBottom: 24 }}>
        <ColocChat />
      </div>

      {/* Charges partagées du mois avec settle */}
      {data && data.charges_lines.length > 0 && (
        <Card>
          <div className="card-title" style={{ marginBottom: 14 }}>Charges partagées du mois</div>
          <table className="t">
            <thead>
              <tr>
                <th>Charge</th>
                <th>Payeur</th>
                <th>Mode</th>
                <th className="r">Total</th>
                <th className="r">Ma part</th>
                <th>Splits</th>
              </tr>
            </thead>
            <tbody>
              {data.charges_lines.map((l) => {
                const ch = charges.data?.find((c) => c.id === l.charge_id);
                const payerName = data.summaries.find((s) => s.user_id === l.payer_user_id)?.user_name;
                return (
                  <tr key={l.charge_id}>
                    <td><strong>{l.label}</strong></td>
                    <td>{payerName ?? '—'}</td>
                    <td><Pill>{l.split_mode}</Pill></td>
                    <td className="r num">{eur(l.total)}</td>
                    <td className="r num">{ch ? eur(ch.my_share) : '—'}</td>
                    <td>
                      {ch?.splits.map((sp) => {
                        const userName = data.summaries.find((u) => u.user_id === sp.user_id)?.user_name;
                        return (
                          <SettleBadge key={sp.id}
                            splitId={sp.id} amount={sp.amount} userName={userName}
                            settled={!!sp.settled_at}
                            onChanged={() => {
                              qc.invalidateQueries({ queryKey: ['coloc'] });
                              qc.invalidateQueries({ queryKey: ['charges'] });
                            }}
                          />
                        );
                      })}
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

function JointContributionsCard({
  account, year, month,
}: { account: Account; year: number; month: number }) {
  const contributions = useQuery({
    queryKey: ['contributions', account.id, year, month],
    queryFn: async () =>
      (await api.get<ContributionRow[]>(
        `/accounts/${account.id}/contributions`,
        { params: { year, month } },
      )).data,
  });
  const rows = contributions.data ?? [];
  const lateCount = rows.filter((r) => num(r.balance) < 0).length;

  return (
    <Card>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <div className="card-title">{account.name}</div>
          <div className="card-sub">{account.bank}</div>
        </div>
        {lateCount > 0 && (
          <Pill tone="rose">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={11} /> {lateCount} en retard
            </span>
          </Pill>
        )}
        {lateCount === 0 && rows.length > 0 && (
          <Pill tone="sage">À jour</Pill>
        )}
      </div>
      {contributions.isLoading && <Loader />}
      {rows.length === 0 && !contributions.isLoading && (
        <p className="small muted">Aucun membre n'a de part attendue ce mois.</p>
      )}
      {rows.length > 0 && (
        <table className="t">
          <thead>
            <tr>
              <th>Membre</th>
              <th className="r">Attendu</th>
              <th className="r">Versé</th>
              <th className="r">Solde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const bal = num(c.balance);
              return (
                <tr key={c.user_id}>
                  <td><strong>{c.user_name}</strong></td>
                  <td className="r num small">{eur(c.expected)}</td>
                  <td className="r num small">{eur(c.actual)}</td>
                  <td className={`r num display ${bal >= 0 ? 'pos' : 'neg'}`}
                    style={{ fontSize: 15 }}>
                    {bal >= 0 ? '+' : ''}{eur(bal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function SettleBadge({
  splitId, amount, userName, settled, onChanged,
}: {
  splitId: number; amount: string; userName?: string; settled: boolean; onChanged: () => void;
}) {
  const m = useMutation({
    mutationFn: async () => api.post(`/charge-splits/${splitId}/${settled ? 'unsettle' : 'settle'}`),
    onSuccess: onChanged,
  });
  return (
    <button
      onClick={() => m.mutate()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', marginRight: 6, marginBottom: 4,
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: settled ? 'var(--sage-bg)' : 'var(--bg-elev)',
        color: settled ? 'var(--sage)' : 'var(--ink-2)',
        fontSize: 11,
        cursor: 'pointer',
      }}
      title={settled ? 'Annuler le settlement' : 'Marquer remboursé'}
    >
      {settled && <Check size={10} />}
      {userName ?? '—'} {eur(amount)}
    </button>
  );
}
