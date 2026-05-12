'use client';

import type { YearlyData } from '@/lib/types';

interface YearChartProps {
  data: YearlyData[];
}

export function YearChart({ data }: YearChartProps) {
  const w = 800, h = 240, pad = 30;
  const maxV = Math.max(...data.flatMap(d => [d.incomes, d.charges, d.savings + d.purchases]));
  const bw = (w - 2 * pad) / 12 - 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 0.5, 1].map(p => (
        <line key={p} x1={pad} x2={w - pad} y1={pad + p * (h - 2 * pad - 20)} y2={pad + p * (h - 2 * pad - 20)} stroke="var(--line)" strokeDasharray="2 4" />
      ))}
      {data.map((d, i) => {
        const x0 = pad + i * ((w - 2 * pad) / 12) + 4;
        const innerW = bw / 3;
        const hi = (d.incomes / maxV) * (h - 2 * pad - 20);
        const hc = (d.charges / maxV) * (h - 2 * pad - 20);
        const hs = (d.savings / maxV) * (h - 2 * pad - 20);
        return (
          <g key={i}>
            <rect x={x0} y={h - pad - 20 - hi} width={innerW} height={hi} fill="var(--sage)" rx="2" />
            <rect x={x0 + innerW + 1} y={h - pad - 20 - hc} width={innerW} height={hc} fill="var(--rose)" rx="2" />
            <rect x={x0 + 2 * innerW + 2} y={h - pad - 20 - hs} width={innerW} height={hs} fill="var(--plum)" rx="2" />
            <text x={x0 + bw / 2} y={h - 6} fontSize="11" fill="var(--ink-3)" textAnchor="middle">{d.m}</text>
          </g>
        );
      })}
    </svg>
  );
}
