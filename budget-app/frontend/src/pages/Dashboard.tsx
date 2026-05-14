import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet, TrendingUp, FileText, PiggyBank, ShoppingBag,
  ChevronLeft, ChevronRight, ArrowRight, Calculator, Download,
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

  // Widget retards d'abondement coloc (depuis 0.11.0)
  interface ColocAlert {
    account_id: number;
    account_name: string;
    user_id: number;
    user_name: string;
    expected: number;
    actual: number;
    balance: number;
    is_self: boolean;
  }
  const alerts = useQuery({
    queryKey: ['dashboard', 'coloc_alerts', cursor.year, cursor.month],
    queryFn: async () =>
      (await api.get<{ alerts: ColocAlert[] }>('/dashboard/coloc_alerts', { params: cursor })).data.alerts,
  });

  function shift(delta: number) {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const data = dash.data;
  const dispo = data ? num(data.available_for_purchases) : 0;
  const totalWealth = data ? num(data.total_final_balance) : 0;
  const monthDelta = data ? totalWealth - num(data.total_initial_balance) : 0;

  // Communication cohérente : on parle du SOLDE (stock) pour le titre,
  // pas du flux mensuel. Un flux négatif n'est pas alarmant si on a du
  // matelas — c'est juste un mois où on puise dans son épargne.
  let titre: string;
  let sousTitre: React.ReactNode;
  if (!data) {
    titre = '—'; sousTitre = '—';
  } else if (totalWealth < 0) {
    titre = 'Découvert prévu en fin de mois.';
    sousTitre = <>Tu termines le mois avec <strong>{eur(totalWealth)}</strong>. Il faut alléger les sorties ou repousser un achat.</>;
  } else if (dispo < 0 && totalWealth > 0) {
    titre = 'Mois déficitaire — tu puises dans tes économies.';
    sousTitre = <>Flux du mois : <strong className="neg">{eur(dispo)}</strong>. Solde projeté fin de mois : <strong>{eur(totalWealth)}</strong> (tu vas le diminuer ce mois).</>;
  } else if (dispo >= 0) {
    titre = 'Tout va bien ce mois-ci.';
    sousTitre = <>Marge dispo pour achats spontanés : <strong className="pos">{eur(dispo)}</strong>. Solde projeté fin de mois : <strong>{eur(totalWealth)}</strong>.</>;
  } else {
    titre = 'Attention, marge négative.';
    sousTitre = <>Flux du mois : {eur(dispo)} · Solde projeté : {eur(totalWealth)}</>;
  }

  return (
    <>
      <PageHeader
        eyebrow={`${MONTHS[cursor.month - 1]} ${cursor.year}`}
        title={titre}
        subtitle={sousTitre}
      >
        <Button onClick={() => shift(-1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{MONTHS[cursor.month - 1]} {cursor.year}</Button>
        <Button onClick={() => shift(1)}><ChevronRight size={14} /></Button>
        <Link to="/simulator"><Button variant="accent"><Calculator size={14} /> Puis-je acheter ?</Button></Link>
        <ExportButtons year={cursor.year} month={cursor.month} />
      </PageHeader>

      {dash.isLoading && <Loader />}
      {dash.isError && <ErrorBox message="Erreur de chargement." />}

      {alerts.data && alerts.data.length > 0 && <ColocAlertsBanner alerts={alerts.data} />}

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
              sub={<>{monthDelta >= 0 ? '↗' : '↘'} {eur(Math.abs(monthDelta).toFixed(2))} ce mois</>}
              subClass={monthDelta >= 0 ? 'pos' : 'neg'} />
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

interface ColocAlert {
  account_id: number;
  account_name: string;
  user_id: number;
  user_name: string;
  expected: number;
  actual: number;
  balance: number;
  is_self: boolean;
}

function ExportButtons({ year, month }: { year: number; month: number }) {
  const [open, setOpen] = useState(false);
  const trigger = async (fmt: 'csv' | 'pdf') => {
    const url = `${api.defaults.baseURL}/export/${fmt}?year=${year}&month=${month}`;
    window.open(url, '_blank');
    setOpen(false);
  };
  return (
    <div style={{ position: 'relative' }}>
      <Button onClick={() => setOpen((o) => !o)}>
        <Download size={14} /> Exporter
      </Button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          borderRadius: 10, padding: 6, minWidth: 160, zIndex: 50,
          boxShadow: 'var(--shadow)',
        }}>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => trigger('csv')}>📊 CSV (Excel)</button>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
            onClick={() => trigger('pdf')}>📄 PDF synthèse</button>
        </div>
      )}
    </div>
  );
}

function ColocAlertsBanner({ alerts }: { alerts: ColocAlert[] }) {
  // Groupage par compte joint pour ne pas répéter le nom du compte
  const byAccount = new Map<number, { name: string; rows: ColocAlert[] }>();
  for (const a of alerts) {
    const entry = byAccount.get(a.account_id) ?? { name: a.account_name, rows: [] };
    entry.rows.push(a);
    byAccount.set(a.account_id, entry);
  }
  const selfHasRetard = alerts.some((a) => a.is_self);
  return (
    <div style={{
      border: '1px solid var(--rose)', background: 'var(--rose-bg)',
      borderRadius: 'var(--radius)', padding: 14, marginBottom: 20,
    }}>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        <strong style={{ color: 'var(--rose)' }}>⚠ Retards d'abondement coloc</strong>
        {selfHasRetard && (
          <span className="small" style={{ color: 'var(--rose)' }}>
            (dont toi)
          </span>
        )}
      </div>
      {Array.from(byAccount.values()).map(({ name, rows }) => (
        <div key={name} style={{ marginTop: 6 }}>
          <div className="small muted">Compte joint <strong>{name}</strong> :</div>
          <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 13 }}>
            {rows.map((r) => (
              <li key={r.user_id}>
                <strong>{r.is_self ? 'Toi' : r.user_name}</strong> doit encore{' '}
                <strong className="neg">{eur(Math.abs(r.balance))}</strong> ce mois
                <span className="muted small"> (versé {eur(r.actual)} / attendu {eur(r.expected)})</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
