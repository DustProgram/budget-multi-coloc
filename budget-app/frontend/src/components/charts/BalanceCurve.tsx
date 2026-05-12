import { eur } from '../../lib/format';

interface Point {
  day: number;
  balance: number;
}

interface Props {
  data: Point[];
  todayIndex?: number;
  width?: number;
  height?: number;
}

export function BalanceCurve({ data, todayIndex, width = 600, height = 220 }: Props) {
  if (data.length === 0) {
    return <div className="muted small" style={{ padding: 28, textAlign: 'center' }}>Pas de données.</div>;
  }
  const padTop = 16, padBottom = 28, padLeft = 36, padRight = 12;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const values = data.map((d) => d.balance);
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = innerW / Math.max(1, data.length - 1);

  const xy = (i: number, v: number): [number, number] => {
    const x = padLeft + i * stepX;
    const y = padTop + (1 - (v - min) / range) * innerH;
    return [x, y];
  };

  const path = data.map((d, i) => {
    const [x, y] = xy(i, d.balance);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  const area = `${path} L ${(padLeft + (data.length - 1) * stepX).toFixed(2)} ${padTop + innerH} L ${padLeft} ${padTop + innerH} Z`;

  const ticks = [0, 0.5, 1].map((p) => min + p * range);
  const todayPt = typeof todayIndex === 'number' && data[todayIndex]
    ? xy(todayIndex, data[todayIndex].balance) : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grid */}
      {ticks.map((tv, i) => {
        const y = padTop + (1 - (tv - min) / range) * innerH;
        return (
          <g key={i}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y}
              stroke="var(--line)" strokeDasharray="2 4" />
            <text x={padLeft - 6} y={y + 3} fontSize="10" fill="var(--ink-3)" textAnchor="end">
              {eur(tv)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="var(--terra)" opacity="0.12" />
      <path d={path} fill="none" stroke="var(--terra)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {todayPt && (
        <>
          <line x1={todayPt[0]} x2={todayPt[0]} y1={padTop} y2={padTop + innerH}
            stroke="var(--ink-3)" strokeDasharray="4 3" />
          <circle cx={todayPt[0]} cy={todayPt[1]} r="4" fill="var(--terra)" stroke="var(--bg-elev)" strokeWidth="2" />
        </>
      )}
      {/* X axis days */}
      {[0, 7, 14, 21, 28].map((d) => {
        const idx = Math.min(d, data.length - 1);
        if (!data[idx]) return null;
        const [x] = xy(idx, data[idx].balance);
        return (
          <text key={d} x={x} y={height - 8} fontSize="10" fill="var(--ink-3)" textAnchor="middle">
            {data[idx].day}
          </text>
        );
      })}
    </svg>
  );
}
