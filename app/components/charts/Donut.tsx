'use client';

import { eur, eurShort } from '@/lib/format';

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSegment[];
}

export function Donut({ data }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 60, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg viewBox="0 0 160 160" width="160" height="160" style={{ flexShrink: 0 }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="20" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const len = frac * c;
          const el = (
            <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={d.color} strokeWidth="20"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="13" fill="var(--ink-3)">Total</text>
        <text x="80" y="98" textAnchor="middle" fontSize="20" fontFamily="var(--display)" fill="var(--ink)">
          {eurShort(total)}
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: 'inline-block' }} />
              {d.label}
            </div>
            <span className="num small">{eur(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
