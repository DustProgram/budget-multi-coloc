import { savings, accounts } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

export default function TransfersPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Virements interbancaires</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Virements</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>Mouvements entre tes comptes. L&apos;épargne automatique apparaît dans Épargne.</p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Nouveau virement</button>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Type</th>
              <th>Flux</th>
              <th>Jour</th>
              <th className="r">Montant</th>
            </tr>
          </thead>
          <tbody>
            {savings.map(r => (
              <tr key={r.id}>
                <td><strong>{r.label}</strong></td>
                <td><span className="pill pill-plum">Récurrent</span></td>
                <td>{accounts.find(a => a.id === r.source_account_id)?.name} → {accounts.find(a => a.id === r.dest_account_id)?.name}</td>
                <td>Le {r.day}</td>
                <td className="r num">{eur(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
