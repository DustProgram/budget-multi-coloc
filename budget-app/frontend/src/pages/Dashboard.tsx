import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet, TrendingUp, FileText, PiggyBank, ShoppingBag,
  ChevronLeft, ChevronRight, ArrowRight, Calculator,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { DashboardData } from '../types';
import {
  Button, Card, EmptyState, ErrorBox, Kpi, Loader, PageHeader,
} from '../components/ui';
import { Donut } from '../components/charts/Donut';
import { Sparkline } from '../components/charts/Sparkline';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export function Dashboard() {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const dash = useQuery({
    queryKey: ['dashboard', cursor.year, cursor.month],
    queryFn: async () => (await api.get<DashboardData>('/dashboard/', { params: cursor })).data,
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const data = dash.data;
  const dispo = data ? num(data.available_for_purchases) : 0;
  const totalWealth = data ? num(data.total_final_balance) : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${MONTHS[cursor.month - 1]} ${cursor.year}`}
        title={dispo >= 0 ? 'Tout va bien ce mois-ci.' : 'Attention, marge négative.'}
        subtitle={data ? <>Tu as <strong>{eur(dispo)}</strong> de marge pour les achats spontanés. Solde projeté fin de mois : <strong>{eur(data.total_final_balance)}</strong>.</> : '—'}
      >
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
        <Link to="/simulator"><Button variant="accent"><Calculator size={14} /> Puis-je acheter ?</Button></Link>
      </PageHeader>

      {dash.isLoading && <Loader />}
      {dash.isError && <ErrorBox message="Erreur de chargement." />}

      {data && data.accounts.length === 0 && (
        <EmptyState
          icon={<Wallet size={26} />}
          title="Aucun compte"
          message="Crée un premier compte dans la rubrique Comptes pour voir ton tableau de bord."
        />
      )}

      {data && data.accounts.length > 0 && (
        <>
          <div className="grid" style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: 24,
          }}>
            <Kpi label="Patrimoine total" icon={<Wallet size={13} />}
              value={eur(totalWealth)} large tinted
              sub={<>↗ {eur((num(data.total_final_balance) - num(data.total_initial_balance)).toFixed(2))} ce mois</>}
              subClass="pos" />
            <Kpi label="Revenus" icon={<TrendingUp size={13} />} value={eur(data.total_incomes)} />
            <Kpi label="Charges" icon={<FileText size={13} />} value={eur(data.total_charges)} />
            <Kpi label="Épargne" icon={<PiggyBank size={13} />} value={eur(data.total_savings)}
              subClass="pos" sub="↗ programmée" />
            <Kpi label="Achats" icon={<ShoppingBag size={13} />} value={eur(data.total_purchases_imputed)} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 24 }}>
            <Card>
              <div className="card-title" style={{ marginBottom: 14 }}>Répartition des dépenses</div>
              <Donut data={[
                { label: 'Charges', value: num(data.total_charges), color: 'var(--rose)' },
                { label: 'Épargne', value: num(data.total_savings), color: 'var(--plum)' },
                { label: 'Achats', value: num(data.total_purchases_imputed), color: 'var(--amber)' },
              ]} />
            </Card>

            <Card>
              <div className="card-head">
                <div className="card-title">Mes comptes</div>
                <Link to="/accounts" className="btn ghost sm">Tout voir <ArrowRight size={12} /></Link>
              </div>
              {data.accounts.map((a) => (
                <div key={a.account_id} className="acct-row">
                  <div className="acct-icon"><Wallet size={14} /></div>
                  <div>
                    <div className="acct-name">{a.account_name}</div>
                    <div className="acct-sub">{a.bank}</div>
                  </div>
                  <Sparkline
                    data={[0.95, 0.98, 1, 1.02, 1.05].map((m) => num(a.final_balance) * m)}
                    color="var(--terra)" width={80} height={28}
                  />
                  <div className="num display" style={{ fontSize: 18 }}>{eur(a.final_balance)}</div>
                </div>
              ))}
            </Card>
          </div>

          <Card>
            <div className="card-title" style={{ marginBottom: 14 }}>Détail par compte</div>
            <table className="t">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th className="r">Initial</th>
                  <th className="r">Revenus</th>
                  <th className="r">Virements</th>
                  <th className="r">Charges</th>
                  <th className="r">Épargne</th>
                  <th className="r">Achats</th>
                  <th className="r">Final</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.account_id}>
                    <td><strong>{a.account_name}</strong><div className="small muted">{a.bank}</div></td>
                    <td className="r num muted">{eur(a.initial_balance)}</td>
                    <td className="r num pos">{eur(a.incomes)}</td>
                    <td className={`r num ${num(a.transfers_net) >= 0 ? 'pos' : 'neg'}`}>{eur(a.transfers_net)}</td>
                    <td className="r num neg">−{eur(a.charges)}</td>
                    <td className="r num" style={{ color: 'var(--plum)' }}>−{eur(a.savings)}</td>
                    <td className="r num" style={{ color: 'var(--amber)' }}>−{eur(a.purchases)}</td>
                    <td className={`r num display ${num(a.final_balance) >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 16 }}>
                      {eur(a.final_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
