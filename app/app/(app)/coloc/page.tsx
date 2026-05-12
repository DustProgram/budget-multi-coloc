import { coloc, charges, users, me } from '@/lib/data';
import { eur } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { Icons } from '@/components/shell/icons';

export default function ColocPage() {
  const c = coloc;
  const total = c.by_user.reduce((s, u) => s + u.total_due, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Coloc · Pixel St-Marc · Mai 2026</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Qui doit quoi à qui.</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            {eur(total)} de charges partagées ce mois. Les remboursements s&apos;équilibrent en 2 virements.
          </p>
        </div>
        <button className="btn"><Icons.download size={14} /> Exporter PDF</button>
      </div>

      {/* Flow viz */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Flux de remboursement</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>2 virements suffisent pour solder le mois</div>
          </div>
        </div>
        <div style={{ padding: '24px 0' }}>
          {c.debts.map((d, i) => {
            const from = users.find(u => u.id === d.from)!;
            const to = users.find(u => u.id === d.to)!;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140 }}>
                  <Avatar user={from} size={44} />
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{from.name}</div>
                    <div className="small muted">doit</div>
                  </div>
                </div>
                <div style={{ flex: 1, height: 2, background: 'var(--line)', position: 'relative' }}>
                  <span className="flow-arrow" style={{ position: 'absolute', inset: 0, height: 2, background: 'var(--line)' }} />
                  <span style={{
                    fontFamily: 'var(--display)', fontSize: 22,
                    position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-elev)', padding: '0 8px', whiteSpace: 'nowrap',
                  }} className="num">{eur(d.amount)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140, justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{to.name}</div>
                    <div className="small muted">reçoit</div>
                  </div>
                  <Avatar user={to} size={44} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-user cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {c.by_user.map(u => {
          const user = users.find(x => x.id === u.user_id)!;
          return (
            <div key={u.user_id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar user={user} size={36} />
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{u.name}</div>
                    <div className="small muted">{u.user_id === me.id ? "C'est toi" : 'Coloc'}</div>
                  </div>
                </div>
                <span className={`pill ${u.balance > 0 ? 'pill-sage' : 'pill-rose'}`}>
                  {u.balance > 0 ? 'Créditeur' : 'Débiteur'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div className="eyebrow">Dû</div>
                  <div className="num" style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{eur(u.total_due)}</div>
                </div>
                <div>
                  <div className="eyebrow">Payé</div>
                  <div className="num" style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{eur(u.paid)}</div>
                </div>
              </div>
              <div className="divider" style={{ margin: '12px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="small muted">Solde</span>
                <span className={`num ${u.balance > 0 ? 'pos' : 'neg'}`} style={{ fontFamily: 'var(--display)', fontSize: 26 }}>
                  {eur(u.balance, { sign: true })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charges detail */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Charges partagées du mois</div>
        <table className="t">
          <thead>
            <tr>
              <th>Charge</th>
              <th>Payée par</th>
              <th>Mode</th>
              <th className="r">Total</th>
              <th className="r">Par personne</th>
            </tr>
          </thead>
          <tbody>
            {charges.filter(c => c.shared).map(c => {
              const payer = users.find(u => u.id === c.payer_id)!;
              return (
                <tr key={c.id}>
                  <td><strong>{c.label}</strong></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={`avatar avatar-${payer.color}`} style={{ width: 20, height: 20, fontSize: 10 }}>{payer.initial}</div>
                      {payer.name}
                    </div>
                  </td>
                  <td><span className="pill">{c.split}</span></td>
                  <td className="r num">{eur(c.total)}</td>
                  <td className="r num">{eur(c.my_share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
