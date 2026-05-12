import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { eur, num } from '../lib/format';
import type { DashboardData } from '../types';
import {
  Button, Card, ErrorBox, Kpi, Loader, PageHeader,
} from '../components/ui';
import { YearChart } from '../components/charts/YearChart';

const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

const METRICS = [
  { id: 'net', label: 'Solde net', color: 'var(--terra)' },
  { id: 'incomes', label: 'Revenus', color: 'var(--sage)' },
  { id: 'charges', label: 'Charges', color: 'var(--rose)' },
  { id: 'savings', label: 'Épargne', color: 'var(--plum)' },
  { id: 'purchases', label: 'Achats', color: 'var(--amber)' },
] as const;

export function YearlyView() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [metric, setMetric] = useState<(typeof METRICS)[number]['id']>('net');

  const query = useQuery({
    queryKey: ['dashboard', 'yearly', year],
    queryFn: async () =>
      (await api.get<DashboardData[]>('/dashboard/yearly', { params: { year } })).data,
  });

  const months = (query.data ?? []).map((d) => ({
    m: MONTHS_SHORT[d.month - 1],
    incomes: num(d.total_incomes),
    charges: num(d.total_charges),
    savings: num(d.total_savings),
    purchases: num(d.total_purchases_imputed),
    net: num(d.total_incomes) - num(d.total_charges) - num(d.total_savings) - num(d.total_purchases_imputed),
  }));

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
