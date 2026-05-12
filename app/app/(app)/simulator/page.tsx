'use client';

import { useState } from 'react';
import { monthly, purchases, accounts } from '@/lib/data';
import { eur } from '@/lib/format';

export default function SimulatorPage() {
  const [amount, setAmount] = useState(120);
  const [accountId, setAccountId] = useState('');
  const [installments, setInstallments] = useState(1);

  const m = monthly;
  const monthlyImpact = amount / installments;
  const availableAfter = m.available_for_purchases - monthlyImpact;
  const finalAfter = m.final_balance - monthlyImpact;
  const ok = availableAfter >= 0;
  const tight = availableAfter >= 0 && availableAfter < 200;

  const verdict = !ok ? 'no' : tight ? 'warn' : 'yes';
  const stamp = !ok ? 'Non.' : tight ? 'Oui, mais…' : 'Oui.';
  const msg = !ok
    ? `Cet achat ferait passer ta marge à ${eur(availableAfter)}. Mieux vaut attendre la prochaine paie le 27.`
    : tight
    ? `Ça passe, mais ta marge tomberait à ${eur(availableAfter)} — fais attention aux extras d'ici fin mai.`
    : `Tranquille. Il te resterait ${eur(availableAfter)} de marge après cet achat.`;

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <p className="eyebrow">Simulateur</p>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Puis-je acheter ça ?</h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>Test instantané sur ta marge réelle, après charges, épargne et achats prévus.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 500 }}>Montant de l&apos;achat</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input num"
              type="number"
              value={amount}
              onChange={e => setAmount(Math.max(0, +e.target.value))}
              style={{ fontFamily: 'var(--display)', fontSize: 48, padding: '12px 16px' }}
            />
            <span style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--display)', fontSize: 32, color: 'var(--ink-3)' }}>€</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 500 }}>Compte</label>
              <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Vue globale</option>
                {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} — {a.bank}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 5, fontWeight: 500 }}>Étalement</label>
              <select className="select" value={installments} onChange={e => setInstallments(+e.target.value)}>
                <option value={1}>Comptant</option>
                <option value={2}>2× sans frais</option>
                <option value={3}>3× sans frais</option>
                <option value={4}>4× sans frais</option>
                <option value={10}>10× (crédit)</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {[50, 100, 250, 500, 1000].map(v => (
              <button key={v} className="btn btn-sm" onClick={() => setAmount(v)}>{v}€</button>
            ))}
          </div>
        </div>

        <div className={`sim-verdict sim-verdict-${verdict}`}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 88, lineHeight: .9, letterSpacing: '-0.03em', color: 'currentColor' }}>
            {stamp}
          </div>
          <div style={{ color: 'var(--ink)', fontSize: 18, lineHeight: 1.4, maxWidth: 480 }}>{msg}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Marge avant', value: eur(m.available_for_purchases) },
          { label: 'Impact mensuel', value: `−${eur(monthlyImpact)}`, className: 'neg' },
          { label: 'Marge après', value: eur(availableAfter), className: ok ? 'pos' : 'neg', bordered: true, borderColor: ok ? 'var(--sage)' : 'var(--rose)' },
          { label: 'Solde fin de mois', value: eur(finalAfter) },
        ].map(kpi => (
          <div key={kpi.label} className="kpi" style={kpi.bordered ? { borderColor: kpi.borderColor } : {}}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{kpi.label}</div>
            <div className={`display num ${kpi.className || ''}`} style={{ fontSize: 34, lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 14 }}>Détail du calcul</div>
        <table className="t">
          <tbody>
            <tr><td>Revenus du mois</td><td className="r num pos">+{eur(m.incomes)}</td></tr>
            <tr><td>Charges (perso + ma part coloc)</td><td className="r num neg">−{eur(m.charges_perso + m.charges_coloc)}</td></tr>
            <tr><td>Épargne programmée</td><td className="r num neg">−{eur(m.savings)}</td></tr>
            <tr><td>Achats déjà imputés ({purchases.length})</td><td className="r num neg">−{eur(m.purchases_imputed)}</td></tr>
            <tr style={{ background: 'var(--bg-sunken)' }}>
              <td><strong>Marge actuelle</strong></td>
              <td className="r num"><strong>{eur(m.available_for_purchases)}</strong></td>
            </tr>
            <tr><td>Cet achat ({installments}× {eur(monthlyImpact)})</td><td className="r num neg">−{eur(monthlyImpact)}</td></tr>
            <tr style={{ background: ok ? 'var(--sage-bg)' : 'var(--rose-bg)' }}>
              <td><strong>Marge restante</strong></td>
              <td className={`r num ${ok ? 'pos' : 'neg'}`}><strong>{eur(availableAfter)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
