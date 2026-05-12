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
// Seuil de "tight" : si après l'achat le solde fin de mois passe sous ce montant
// on affiche "Oui, mais…" au lieu de "Oui." franc. Réglable côté user plus tard
// si besoin — pour l'instant on garde un défaut raisonnable.
const TIGHT_THRESHOLD = 100;

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

  // Verdict basé sur le SOLDE FIN DE MOIS (pas la "marge" qu'on enlève)
  // - Si solde final négatif : Non
  // - Si solde final positif mais sous TIGHT_THRESHOLD : Oui mais…
  // - Sinon : Oui
  // Si un compte est sélectionné, on regarde aussi le solde de ce compte
  // après achat — un solde compte négatif tue le verdict (découvert).
  const monthlyImpact = (num(amount) / installments);
  const finalAfter = result ? num(result.final_balance_after) : 0;
  const accountAfter = result?.account_balance_after !== null
    && result?.account_balance_after !== undefined
    ? num(result.account_balance_after)
    : null;

  let ok = false;
  let tight = false;
  if (result) {
    const globalOK = finalAfter >= 0;
    const accountOK = accountAfter === null ? true : accountAfter >= 0;
    ok = globalOK && accountOK;
    tight = ok && (finalAfter < TIGHT_THRESHOLD || (accountAfter !== null && accountAfter < TIGHT_THRESHOLD));
  }

  const verdict = !result ? null : !ok ? 'no' : tight ? 'warn' : 'yes';
  const stamp = !result ? '' : !ok ? 'Non.' : tight ? 'Oui, mais…' : 'Oui.';
  const msg = !result ? '' : !ok
    ? `Ce ${installments > 1 ? 'crédit' : 'achat'} ferait passer ton solde fin de mois à ${eur(finalAfter)}${accountAfter !== null && accountAfter < 0 ? ` (et ton compte à ${eur(accountAfter)} — découvert)` : ''}. Mieux vaut attendre.`
    : tight
    ? `Ça passe : solde fin de mois ${eur(finalAfter)}${accountAfter !== null ? ` (compte : ${eur(accountAfter)})` : ''}. Tu seras juste, fais attention aux extras.`
    : `Tranquille. Solde fin de mois ${eur(finalAfter)}${accountAfter !== null ? ` · solde compte ${eur(accountAfter)}` : ''}.`;

  return (
    <>
      <PageHeader
        eyebrow="Simulateur"
        title="Puis-je acheter ça ?"
        subtitle="Le verdict regarde ton solde fin de mois après l'achat — pas une marge théorique."
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
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <Kpi label="Solde fin de mois avant" value={eur(result.final_balance_before)} />
            <Kpi
              label="Impact"
              value={installments === 1 ? `−${eur(monthlyImpact)}` : `−${eur(monthlyImpact)} × ${installments}`}
              subClass="neg"
            />
            <Kpi
              label="Solde fin de mois après"
              value={eur(finalAfter)}
              tinted
              subClass={ok ? 'pos' : 'neg'}
            />
          </div>

          <Card>
            <div className="card-title" style={{ marginBottom: 14 }}>Détail du calcul</div>
            <table className="t">
              <tbody>
                <tr>
                  <td>Solde fin de mois actuel (sans cet achat)</td>
                  <td className="r num">{eur(result.final_balance_before)}</td>
                </tr>
                <tr>
                  <td>
                    Mensualité de l'achat ({installments}× {eur(monthlyImpact)})
                  </td>
                  <td className="r num neg">−{eur(monthlyImpact)}</td>
                </tr>
                <tr style={{ background: ok ? 'var(--sage-bg)' : 'var(--rose-bg)' }}>
                  <td><strong>Solde fin de mois après cet achat</strong></td>
                  <td className={`r num ${ok ? 'pos' : 'neg'}`}>
                    <strong>{eur(finalAfter)}</strong>
                  </td>
                </tr>
                {accountAfter !== null && (
                  <tr style={{ background: accountAfter >= 0 ? 'var(--sage-bg)' : 'var(--rose-bg)' }}>
                    <td>
                      <strong>Solde du compte sélectionné après</strong>
                    </td>
                    <td className={`r num ${accountAfter >= 0 ? 'pos' : 'neg'}`}>
                      <strong>{eur(accountAfter)}</strong>
                      {accountAfter < 0 && <span className="small"> (découvert)</span>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="small muted" style={{ marginTop: 12 }}>
              Le verdict prend en compte les revenus du mois, charges, épargne
              automatique et achats déjà imputés. Pas de "marge minimum" cachée
              — le seuil "Oui mais…" est juste {eur(TIGHT_THRESHOLD)} de coussin.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
