import { purchases } from '@/lib/data';
import { eur } from '@/lib/format';
import { Icons } from '@/components/shell/icons';

export default function PurchasesPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Achats & étalements</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Achats</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>Achats comptant ou en plusieurs fois — répartis automatiquement sur les mois.</p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Nouvel achat</button>
      </div>
      <div className="card">
        <table className="t">
          <thead>
            <tr>
              <th>Date</th>
              <th>Achat</th>
              <th>Catégorie</th>
              <th>Étalement</th>
              <th className="r">Total</th>
              <th className="r">Ce mois</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map(r => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td><strong>{r.desc}</strong></td>
                <td><span className="pill">{r.category}</span></td>
                <td>{r.installments === 1 ? 'Comptant' : `${r.installments}× ${eur(r.monthly)}`}</td>
                <td className="r num">{eur(r.total)}</td>
                <td className="r num neg display" style={{ fontSize: 17 }}>−{eur(r.monthly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
