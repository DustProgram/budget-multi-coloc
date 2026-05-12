import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, SimulationResult } from '../types';
import {
  Button, Card, ErrorBox, Field, Input, PageHeader, Select, Kpi,
} from '../components/ui';

const QUICKS = [50, 100, 250, 500, 1000];

export function Simulator() {
  const today = new Date();
  const [amount, setAmount] = useState('120');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [installments, setInstallments] = useState(1);
  const [year] = useState(today.getFullYear());
  const [month] = useState(today.getMonth() + 1);

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  const sim = useMutation({
    mutationFn: async () => {
      const monthly = num(amount) / Math.max(1, installments);
      const { data } = await api.post<SimulationResult>('/simulator/', {
        amount: monthly.toFixed(2),
        account_id: accountId,
        year, month,
      });
      return data;
    },
  });

  const result = sim.data;
  const ok = result?.can_afford_global && (accountId === null || result?.can_afford_account);
  const tight = ok && result && num(result.available_after) < 200;
  const verdict = !result ? null : !ok ? 'no' : tight ? 'warn' : 'yes';
  const stamp = !result ? '' : !ok ? 'Non.' : tight ? 'Oui, mais…' : 'Oui.';
  const msg = !result ? '' : !ok
    ? `Cet achat ferait passer ta marge à ${eur(result.available_after)}. Mieux vaut attendre.`
    : tight
    ? `Ça passe, mais ta marge tomberait à ${eur(result.available_after)} — attention aux extras d'ici fin de mois.`
    : `Tranquille. Il te resterait ${eur(result.available_after)} de marge après cet achat.`;

  return (
    <>
      <PageHeader
        eyebrow="Simulateur"
        title="Puis-je acheter ça ?"
        subtitle="Test instantané sur ta marge réelle, après charges, épargne et achats prévus."
      />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); sim.mutate(); }}>
            <Field label="Montant de l'achat">
              <Input
                type="number" step="0.01" required value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input big"
              />
            </Field>
            <div className="row gap-2" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
              {QUICKS.map((v) => (
                <Button key={v} type="button" variant="sm" onClick={() => setAmount(String(v))}>
                  {v}€
                </Button>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Compte">
                <Select value={accountId ?? ''}
                  onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Vue globale</option>
                  {accounts.data?.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Étalement">
                <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  <option value={1}>Comptant</option>
                  <option value={2}>2× sans frais</option>
                  <option value={3}>3× sans frais</option>
                  <option value={4}>4× sans frais</option>
                  <option value={10}>10× (crédit)</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="primary" disabled={sim.isPending} style={{ marginTop: 12 }}>
              <Calculator size={14} /> Simuler
            </Button>
            {sim.isError && <ErrorBox message="Erreur lors de la simulation." />}
          </form>
        </Card>

        {verdict && (
          <div className={`sim-verdict ${verdict}`}>
            <div className="sim-stamp">{stamp}</div>
            <div className="sim-msg">{msg}</div>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <Kpi label="Marge avant" value={eur(result.available_before)} />
            <Kpi label="Impact mensuel"
              value={`−${eur((num(amount) / installments).toFixed(2))}`}
              subClass="neg" />
            <Kpi label="Marge après" value={eur(result.available_after)}
              subClass={ok ? 'pos' : 'neg'} />
            <Kpi label="Solde fin de mois" value={eur(result.final_balance_after)} />
          </div>

          <Card>
            <div className="card-title" style={{ marginBottom: 14 }}>Détail du verdict</div>
            <table className="t">
              <tbody>
                <tr><td>Marge actuelle</td><td className="r num">{eur(result.available_before)}</td></tr>
                <tr><td>Cet achat ({installments}× {eur((num(amount) / installments).toFixed(2))})</td>
                  <td className="r num neg">−{eur((num(amount) / installments).toFixed(2))}</td></tr>
                <tr style={{ background: ok ? 'var(--sage-bg)' : 'var(--rose-bg)' }}>
                  <td><strong>Marge restante</strong></td>
                  <td className={`r num ${ok ? 'pos' : 'neg'}`}><strong>{eur(result.available_after)}</strong></td>
                </tr>
                {result.account_balance_after !== null && (
                  <tr><td>Solde du compte après</td>
                    <td className="r num">{eur(result.account_balance_after)}</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
