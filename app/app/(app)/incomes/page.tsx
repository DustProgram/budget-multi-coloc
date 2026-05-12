import { incomes, accounts, monthly } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

export default function IncomesPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Revenus</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Revenus</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>{eur(monthly.incomes)} prévus ce mois — 2 sources actives.</p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Nouveau revenu</button>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Jour</th>
              <th>Compte</th>
              <th className="r">Montant</th>
            </tr>
          </thead>
          <tbody>
            {incomes.map(r => (
              <tr key={r.id}>
                <td><strong>{r.source}</strong></td>
                <td><span className="pill">{r.type}</span></td>
                <td>Le {r.day}</td>
                <td>{accounts.find(a => a.id === r.account_id)?.name}</td>
                <td className="r num pos display" style={{ fontSize: 18 }}>+{eur(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
