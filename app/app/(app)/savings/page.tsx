import { savings, accounts, monthly } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

export default function SavingsPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Épargne</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Épargne automatique</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>{eur(monthly.savings)} mis de côté chaque mois automatiquement.</p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Nouvelle règle</button>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Règle</th>
              <th>Flux</th>
              <th>Jour</th>
              <th className="r">Montant</th>
            </tr>
          </thead>
          <tbody>
            {savings.map(r => (
              <tr key={r.id}>
                <td><strong>{r.label}</strong></td>
                <td>{accounts.find(a => a.id === r.source_account_id)?.name} → {accounts.find(a => a.id === r.dest_account_id)?.name}</td>
                <td>Le {r.day}</td>
                <td className="r num" style={{ color: 'var(--plum)', fontFamily: 'var(--display)', fontSize: 18 }}>{eur(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
