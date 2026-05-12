import { useQuery } from '@tanstack/react-query';
import { Briefcase, Download, FileText, TrendingUp, Wallet, Percent } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, Charge, Income } from '../types';
import {
  Card, EmptyState, ErrorBox, Kpi, Loader, PageHeader, Pill,
} from '../components/ui';
import { Sparkline } from '../components/charts/Sparkline';

const URSSAF_RATE = 0.22;        // Taux moyen micro-entrepreneur BNC
const TVA_THRESHOLD = 36_800;    // Franchise BNC 2024+

export function ComptaPro() {
  const accounts = useQuery({
    queryKey: ['accounts', 'pro'],
    queryFn: async () => (await api.get<Account[]>('/accounts/?space=pro')).data,
  });
  const incomes = useQuery({
    queryKey: ['incomes'],
    queryFn: async () => (await api.get<Income[]>('/incomes/')).data,
  });
  const charges = useQuery({
    queryKey: ['charges'],
    queryFn: async () => (await api.get<Charge[]>('/charges/')).data,
  });

  const proAccountIds = new Set((accounts.data ?? []).map((a) => a.id));

  const proIncomes = (incomes.data ?? []).filter((i) => i.account_id && proAccountIds.has(i.account_id));
  const proCharges = (charges.data ?? []).filter((c) => c.account_id && proAccountIds.has(c.account_id));

  const caMonth = proIncomes.reduce((s, i) => s + num(i.amount), 0);
  const caYtd = caMonth * (new Date().getMonth() + 1);  // projection simple
  const chargesMonth = proCharges.reduce((s, c) => s + num(c.total_amount), 0);
  const provisionUrssaf = caMonth * URSSAF_RATE;
  const netDispo = caMonth - provisionUrssaf - chargesMonth;
  const tvaStatus = caYtd > TVA_THRESHOLD ? 'Assujetti' : 'Franchise';
  const tvaRemaining = Math.max(0, TVA_THRESHOLD - caYtd);
  const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const loading = accounts.isLoading || incomes.isLoading || charges.isLoading;
  const error = accounts.isError || incomes.isError || charges.isError;

  return (
    <>
      <PageHeader
        eyebrow={`Comptabilité pro · ${monthLabel}`}
        title={eur(caMonth)}
        subtitle={`Chiffre d'affaires du mois · ${eur(caYtd)} projeté depuis janvier.`}
      >
        <button className="btn" disabled><Download size={14} /> Export FEC</button>
      </PageHeader>

      {loading && <Loader />}
      {error && <ErrorBox message="Erreur de chargement." />}

      {!loading && accounts.data && accounts.data.length === 0 && (
        <EmptyState
          icon={<Briefcase size={26} />}
          title="Aucun compte pro"
          message={`Marque un compte comme "pro" depuis la liste des comptes pour qu'il apparaisse ici.`}
        />
      )}

      {!loading && accounts.data && accounts.data.length > 0 && (
        <>
          <div className="grid" style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            marginBottom: 24,
          }}>
            <Kpi label="CA encaissé" icon={<TrendingUp size={13} />} value={eur(caMonth)}
              sub={<>{proIncomes.length} encaissement{proIncomes.length > 1 ? 's' : ''}</>} />
            <Kpi label={`Provision URSSAF (${Math.round(URSSAF_RATE * 100)}%)`}
              icon={<Percent size={13} />}
              value={`−${eur(provisionUrssaf)}`} subClass="neg"
              sub="À mettre de côté" />
            <Kpi label="Régime TVA" icon={<FileText size={13} />}
              value={tvaStatus}
              sub={`Seuil ${eur(TVA_THRESHOLD)} — reste ${eur(tvaRemaining)}`} />
            <Kpi label="Net disponible" icon={<Wallet size={13} />}
              value={eur(netDispo)} tinted
              sub="CA − URSSAF − charges" subClass={netDispo >= 0 ? 'pos' : 'neg'} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Card>
              <p className="eyebrow">Comptes pro</p>
              <div style={{ marginTop: 8 }}>
                {accounts.data.map((a) => (
                  <div key={a.id} className="acct-row">
                    <div className="acct-icon"><Briefcase size={14} /></div>
                    <div>
                      <div className="acct-name">{a.name}</div>
                      <div className="acct-sub">{a.bank} · {a.type}</div>
                    </div>
                    <Sparkline data={[0.95, 0.98, 1, 1.02, 1.05].map((m) => num(a.initial_balance) * m)}
                      color="var(--plum)" width={80} height={28} />
                    <div className="num display" style={{ fontSize: 18 }}>{eur(a.initial_balance)}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <p className="eyebrow">Encaissements du mois</p>
              {proIncomes.length === 0 ? (
                <div className="muted small" style={{ padding: 24, textAlign: 'center' }}>
                  Aucun encaissement enregistré pour le moment.
                </div>
              ) : (
                <table className="t" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Jour</th>
                      <th>Type</th>
                      <th className="r">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proIncomes.map((i) => (
                      <tr key={i.id}>
                        <td><strong>{i.source}</strong></td>
                        <td>Le {i.day_of_month}</td>
                        <td><Pill>{i.type}</Pill></td>
                        <td className="r num pos">+{eur(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
