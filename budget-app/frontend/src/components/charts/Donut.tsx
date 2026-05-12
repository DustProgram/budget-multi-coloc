import { eur } from '../../lib/format';

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: Slice[];
  size?: number;
  thickness?: number;
}

export function Donut({ data, size = 200, thickness = 28 }: Props) {
  const filtered = data.filter((s) => s.value > 0);
  const total = filtered.reduce((s, x) => s + x.value, 0);
  const radius = (size - thickness) / 2;
  const c = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = filtered.map((s) => {
    const frac = s.value / (total || 1);
    const arc = {
      ...s,
      dasharray: `${frac * c} ${c}`,
      dashoffset: -offset,
    };
    offset += frac * c;
    return arc;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          <circle r={radius} fill="none" stroke="var(--bg-sunken)" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle key={i} r={radius} fill="none"
              stroke={a.color} strokeWidth={thickness}
              strokeDasharray={a.dasharray} strokeDashoffset={a.dashoffset}
              strokeLinecap="butt" />
          ))}
        </g>
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle"
          fontFamily="var(--display)" fontSize="22" fill="var(--ink)">
          {eur(total)}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle"
          fontSize="11" fill="var(--ink-3)" letterSpacing=".08em">
          TOTAL
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {filtered.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--ink-2)' }}>{s.label}</span>
            <span className="num" style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{eur(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
