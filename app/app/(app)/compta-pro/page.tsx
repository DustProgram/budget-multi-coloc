import { pro } from '@/lib/data';
import { eur } from '@/lib/format';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icons } from '@/components/shell/icons';

export default function ComptaProPage() {
  const p = pro;
  const provisionEur = p.ca_month * (p.urssaf_provision / 100);
  const netDisponible = p.ca_month - provisionEur - p.charges_month - p.accountant.monthly;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Comptabilité pro · Mai 2026</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>{eur(p.ca_month)}</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>Chiffre d&apos;affaires du mois · {eur(p.ca_ytd)} depuis janvier.</p>
        </div>
        <button className="btn"><Icons.download size={14} /> Export comptable</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <p className="eyebrow">CA encaissé</p>
          <div className="num display" style={{ fontSize: 36 }}>{eur(p.ca_month)}</div>
          <Sparkline data={[2800, 3400, 2900, 4100, 3700, 4200]} color="var(--accent)" width={220} height={40} fill />
        </div>
        <div className="card">
          <p className="eyebrow">Provision URSSAF ({p.urssaf_provision}%)</p>
          <div className="num display neg" style={{ fontSize: 36 }}>−{eur(provisionEur)}</div>
          <div className="small muted" style={{ marginTop: 4 }}>Mis de côté automatiquement sur compte Provision.</div>
        </div>
        <div className="card">
          <p className="eyebrow">Régime TVA</p>
          <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>{p.tva_status}</div>
          <div className="small muted" style={{ marginTop: 4 }}>Seuil : 36 800 € — il te reste 8 400 €.</div>
        </div>
        <div className="card" style={{ background: 'var(--accent-bg)' }}>
          <p className="eyebrow">Net disponible</p>
          <div className="num display pos" style={{ fontSize: 36 }}>{eur(netDisponible)}</div>
          <div className="small muted" style={{ marginTop: 4 }}>CA − URSSAF − charges − cabinet.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '0 0 16px' }}>Factures du mois</h3>
          <table className="t">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="r">Montant</th>
              </tr>
            </thead>
            <tbody>
              {p.invoices.map(inv => (
                <tr key={inv.id}>
                  <td><strong>{inv.client}</strong></td>
                  <td className="muted">{inv.date}</td>
                  <td><span className={`pill ${inv.status === 'payée' ? 'pill-sage' : 'pill-amber'}`}>{inv.status}</span></td>
                  <td className="r num">{eur(inv.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <p className="eyebrow">Cabinet comptable</p>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '4px 0 12px' }}>{p.accountant.name}</h3>
          <div className="num display" style={{ fontSize: 32 }}>{eur(p.accountant.monthly)}<span className="small muted" style={{ marginLeft: 6 }}>/ mois</span></div>
          <div className="small muted" style={{ marginTop: 4 }}>Soit {eur(p.accountant.monthly * 12)} sur l&apos;année.</div>
          <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.accountant.included.map(item => (
              <li key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <Icons.check size={14} /> {item}
              </li>
            ))}
          </ul>
          <button className="btn" style={{ width: '100%', marginTop: 12 }}>Comparer d&apos;autres cabinets</button>
        </div>
      </div>
    </>
  );
}
