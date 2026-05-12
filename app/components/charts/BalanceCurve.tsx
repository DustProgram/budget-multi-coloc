'use client';

import type { BalancePoint } from '@/lib/types';
import { eur } from '@/lib/format';

interface BalanceCurveProps {
  data: BalancePoint[];
  todayIndex: number;
}

export function BalanceCurve({ data, todayIndex }: BalanceCurveProps) {
  const w = 600, h = 200, pad = 24;
  const vals = data.map(d => d.balance);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (h - 2 * pad);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.balance).toFixed(1)}`).join(' ');
  const fillPath = `${path} L${x(data.length - 1)} ${h - pad} L${x(0)} ${h - pad} Z`;
  const ti = todayIndex;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="grad-balance" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--terra)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--terra)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(p => (
        <line key={p} x1={pad} x2={w - pad} y1={pad + p * (h - 2 * pad)} y2={pad + p * (h - 2 * pad)} stroke="var(--line)" strokeDasharray="2 4" />
      ))}
      <path d={fillPath} fill="url(#grad-balance)" />
      <path d={path} fill="none" stroke="var(--terra)" strokeWidth="2" strokeLinecap="round" />
      <line x1={x(ti)} x2={x(ti)} y1={pad} y2={h - pad} stroke="var(--ink)" strokeDasharray="3 3" />
      <circle cx={x(ti)} cy={y(data[ti].balance)} r="5" fill="var(--ink)" />
      <text x={x(ti) + 8} y={y(data[ti].balance) - 8} fontSize="11" fill="var(--ink)" fontFamily="var(--display)">
        Aujourd&apos;hui · {eur(data[ti].balance, { dec: 0 })}
      </text>
      {[1, 5, 10, 15, 20, 25, 30].map(d => (
        <text key={d} x={x(d - 1)} y={h - 4} fontSize="10" fill="var(--ink-3)" textAnchor="middle">{d}</text>
      ))}
    </svg>
  );
}
