import { charges, users, monthly } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

export default function ChargesPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Charges</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Charges</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>{eur(monthly.charges_perso + monthly.charges_coloc)} de charges ce mois (perso + ma part coloc).</p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Nouvelle charge</button>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Charge</th>
              <th>Partage</th>
              <th>Mode</th>
              <th>Jour</th>
              <th className="r">Total</th>
              <th className="r">Ma part</th>
            </tr>
          </thead>
          <tbody>
            {charges.map(r => (
              <tr key={r.id}>
                <td><strong>{r.label}</strong></td>
                <td><span className={`pill ${r.shared ? 'pill-sage' : ''}`}>{r.shared ? 'Coloc' : 'Perso'}</span></td>
                <td>{r.split}</td>
                <td>Le {r.day}</td>
                <td className="r num">{eur(r.total)}</td>
                <td className="r num neg display" style={{ fontSize: 17 }}>−{eur(r.my_share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
