export function eur(v: number, opts: { sign?: boolean; dec?: number } = {}): string {
  const n = Number(v);
  const sign = opts.sign && n > 0 ? '+' : '';
  return sign + new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: opts.dec ?? 2,
  }).format(n);
}

export function eurShort(v: number): string {
  const n = Math.abs(Number(v));
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k€';
  return Math.round(n) + '€';
}
