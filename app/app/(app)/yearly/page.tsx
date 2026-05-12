'use client';

import { useState } from 'react';
import { yearly } from '@/lib/data';
import { eur, eurShort } from '@/lib/format';
import { YearChart } from '@/components/charts/YearChart';
import { Icons } from '@/components/shell/icons';

const metrics = [
  { id: 'net', label: 'Solde net', accessor: (d: typeof yearly[0]) => d.net, color: 'var(--terra)' },
  { id: 'incomes', label: 'Revenus', accessor: (d: typeof yearly[0]) => d.incomes, color: 'var(--sage)' },
  { id: 'charges', label: 'Charges', accessor: (d: typeof yearly[0]) => d.charges, color: 'var(--rose)' },
  { id: 'savings', label: 'Épargne', accessor: (d: typeof yearly[0]) => d.savings, color: 'var(--plum)' },
  { id: 'purchases', label: 'Achats', accessor: (d: typeof yearly[0]) => d.purchases, color: 'var(--amber)' },
];

export default function YearlyPage() {
  const [metric, setMetric] = useState('net');
  const m = metrics.find(x => x.id === metric)!;
  const values = yearly.map(m.accessor);
  const min = Math.min(...values), max = Math.max(...values);

  const totalIn = yearly.reduce((s, d) => s + d.incomes, 0);
  const totalCharges = yearly.reduce((s, d) => s + d.charges, 0);
  const totalSaved = yearly.reduce((s, d) => s + d.savings, 0);
  const totalNet = yearly.reduce((s, d) => s + d.net, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Vue annuelle · 2026</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>
            Une année en un coup d&apos;œil.
          </h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            {eur(totalNet)} épargnés en net sur 12 mois — c&apos;est ton meilleur résultat depuis l&apos;ouverture du compte.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn"><Icons.chevL size={14} /> 2025</button>
          <button className="btn btn-primary">2026</button>
          <button className="btn">2027 <Icons.chevR size={14} /></button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {[
          { label: 'Revenus', value: eurShort(totalIn) },
          { label: 'Charges', value: eurShort(totalCharges) },
          { label: 'Épargne', value: eurShort(totalSaved) },
          { label: 'Solde net', value: eurShort(totalNet), tinted: true },
        ].map(kpi => (
          <div key={kpi.label} className={`kpi ${kpi.tinted ? 'kpi-tinted' : ''}`}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{kpi.label}</div>
            <div className="display" style={{ fontSize: 34, lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Heatmap mensuelle</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {metrics.map(x => (
              <button key={x.id} className={`btn btn-sm ${metric === x.id ? 'btn-primary' : ''}`} onClick={() => setMetric(x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
          {yearly.map((d, i) => {
            const v = m.accessor(d);
            const intensity = (v - min) / (max - min || 1);
            return (
              <div key={i} style={{
                aspectRatio: '1.2',
                borderRadius: 7,
                background: `color-mix(in oklch, ${m.color} ${10 + intensity * 65}%, var(--bg-sunken))`,
                position: 'relative',
                cursor: 'pointer',
                border: '1px solid transparent',
              }}>
                <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 10, color: 'var(--ink-3)' }}>{d.m}</span>
                <span style={{ position: 'absolute', bottom: 4, left: 6, fontFamily: 'var(--display)', fontSize: 16, color: intensity > 0.5 ? 'white' : 'var(--ink)' }}>{eurShort(v)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Year chart */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Évolution sur 12 mois</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-3)', alignItems: 'center' }}>
            {[['sage', 'Revenus'], ['rose', 'Charges'], ['plum', 'Épargne']].map(([c, l]) => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: `var(--${c})` }} /> {l}
              </span>
            ))}
          </div>
        </div>
        <YearChart data={yearly} />
      </div>
    </>
  );
}
