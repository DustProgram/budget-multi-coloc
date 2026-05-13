import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { Account, DashboardData } from '../types';
import {
  Button, Card, ErrorBox, Kpi, Loader, PageHeader, Select,
} from '../components/ui';
import { YearChart } from '../components/charts/YearChart';

type AccountFilter = 'all' | 'perso' | 'joint' | number;

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

const METRICS = [
  { id: 'patrimoine', label: 'Patrimoine', color: 'var(--terra)' },
  { id: 'net', label: 'Solde net', color: 'var(--terra)' },
  { id: 'incomes', label: 'Revenus', color: 'var(--sage)' },
  { id: 'charges', label: 'Charges', color: 'var(--rose)' },
  { id: 'savings', label: 'Épargne', color: 'var(--plum)' },
  { id: 'purchases', label: 'Achats', color: 'var(--amber)' },
] as const;

export function YearlyView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [metric, setMetric] = useState<(typeof METRICS)[number]['id']>('net');
  const [filter, setFilter] = useState<AccountFilter>('all');

  const query = useQuery({
    queryKey: ['dashboard', 'yearly', year],
    queryFn: async () =>
      (await api.get<DashboardData[]>('/dashboard/yearly', { params: { year } })).data,
  });
  const accountsQ = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: async () => (await api.get<Account[]>('/accounts/')).data,
  });

  // Comptes qui matchent le filtre courant (perso = solo, joint = type 'Compte joint')
  const filteredAccountIds = useMemo(() => {
    const all = accountsQ.data ?? [];
    if (filter === 'all') return null;  // null = pas de filtre
    if (filter === 'perso') return new Set(all.filter((a) => a.type !== 'Compte joint').map((a) => a.id));
    if (filter === 'joint') return new Set(all.filter((a) => a.type === 'Compte joint').map((a) => a.id));
    return new Set([filter as number]);
  }, [filter, accountsQ.data]);

  const months = useMemo(() => {
    // Calcul du patrimoine cumulé : on accumule les deltas mensuels sur le
    // solde initial des comptes. Le mois N affiche le solde EN FIN de mois N.
    let cumulative = 0;
    let baseSet = false;
    return (query.data ?? []).map((d) => {
      const accs = filteredAccountIds
        ? d.accounts.filter((a) => filteredAccountIds.has(a.account_id))
        : d.accounts;
      const startBal = accs.reduce((s, a) => s + num(a.initial_balance), 0);
      const endBal = accs.reduce((s, a) => s + num(a.final_balance), 0);
      if (!baseSet) {
        cumulative = startBal;
        baseSet = true;
      }
      cumulative += endBal - startBal;
      const incomes = filteredAccountIds
        ? accs.reduce((s, a) => s + num(a.incomes), 0)
        : num(d.total_incomes);
      const charges = filteredAccountIds
        ? -accs.reduce((s, a) => s + num(a.charges), 0)
        : num(d.total_charges);
      const savings = filteredAccountIds
        ? -accs.reduce((s, a) => s + num(a.savings), 0)
        : num(d.total_savings);
      const purchases = filteredAccountIds
        ? -accs.reduce((s, a) => s + num(a.purchases), 0)
        : num(d.total_purchases_imputed);
      return {
        m: MONTHS_SHORT[d.month - 1],
        incomes, charges, savings, purchases,
        net: endBal - startBal,
        patrimoine: cumulative,
      };
    });
  }, [query.data, filteredAccountIds]);

  const totalIn = months.reduce((s, x) => s + x.incomes, 0);
  const totalCh = months.reduce((s, x) => s + x.charges, 0);
  const totalSv = months.reduce((s, x) => s + x.savings, 0);
  const totalNet = months.reduce((s, x) => s + x.net, 0);

  const values = months.map((m) => Number(m[metric as keyof typeof m]));
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const range = max - min || 1;
  const metricColor = METRICS.find((m) => m.id === metric)!.color;

  return (
    <>
      <PageHeader
        eyebrow={`Vue annuelle · ${year}`}
        title="Une année en un coup d'œil."
        subtitle={`${eur(totalNet)} en net sur 12 mois.`}
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
        <Button onClick={() => setYear((y) => y - 1)}><ChevronLeft size={14} /></Button>
        <Button variant="primary">{year}</Button>
        <Button onClick={() => setYear((y) => y + 1)}><ChevronRight size={14} /></Button>
      </PageHeader>

      {query.isLoading && <Loader />}
      {query.isError && <ErrorBox message="Erreur de chargement." />}

      {query.data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            <Kpi label="Revenus" value={eur(totalIn)} />
            <Kpi label="Charges" value={eur(totalCh)} />
            <Kpi label="Épargne" value={eur(totalSv)} />
            <Kpi label="Solde net" value={eur(totalNet)} tinted />
          </div>

          <Card style={{ marginBottom: 24 }}>
            <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title">Heatmap mensuelle</div>
              <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                {METRICS.map((x) => (
                  <Button key={x.id}
                    variant={metric === x.id ? 'primary' : 'sm'}
                    onClick={() => setMetric(x.id)}
                  >
                    {x.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="heat">
              {months.map((d, i) => {
                const v = Number(d[metric as keyof typeof d]);
                const intensity = (v - min) / range;
                return (
                  <div key={i} className="heat-cell" style={{
                    background: `color-mix(in oklch, ${metricColor} ${(10 + intensity * 65).toFixed(0)}%, var(--bg-sunken))`,
                  }}>
                    <span className="m">{d.m}</span>
                    <span className="v" style={{ color: intensity > 0.5 ? 'white' : 'var(--ink)' }}>
                      {v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k€` : `${Math.round(v)}€`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="card-head">
              <div className="card-title">Évolution sur 12 mois</div>
              <div className="row gap-3" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {[['sage', 'Revenus'], ['rose', 'Charges'], ['plum', 'Épargne']].map(([c, l]) => (
                  <span key={c} className="row" style={{ alignItems: 'center', gap: 6 }}>
                    <span className="dot" style={{ background: `var(--${c})`, width: 8, height: 8, borderRadius: '50%' }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <YearChart data={months} />
          </Card>
        </>
      )}
    </>
  );
}
