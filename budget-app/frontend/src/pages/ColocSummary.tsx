import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account } from '../types';
import {
  Button, Card, EmptyState, Loader, PageHeader, Pill,
} from '../components/ui';
import { ColocChat } from '../components/ColocChat';

interface ContributionRow {
  user_id: number;
  user_name: string;
  expected: string;
  actual: string;
  balance: string;
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export function ColocSummary() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const allAccounts = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });
  const jointAccounts = (allAccounts.data ?? []).filter((a) => a.type === 'Compte joint');

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  return (
    <>
      <PageHeader
        eyebrow={`Coloc · ${MONTHS[cursor.month - 1]} ${cursor.year}`}
        title="Abondements des comptes joints"
        subtitle="Qui a viré combien vs sa part attendue ce mois — chacun abonde le joint, pas de remboursement entre colocs."
      >
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
      </PageHeader>

      {allAccounts.isLoading && <Loader />}

      {!allAccounts.isLoading && jointAccounts.length === 0 && (
        <EmptyState
          icon={<Users size={26} />}
          title="Pas de compte joint"
          message="Crée un compte de type 'Compte joint', ajoute des co-titulaires depuis la page Comptes, puis saisis tes charges en mode partagé (Égal / Pourcentage / Montant fixe / Par utilisateur)."
        />
      )}

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

      {/* Discussion du foyer (configurée dans Réglages → Mon foyer) */}
      <div style={{ marginBottom: 24 }}>
        <ColocChat />
      </div>
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
