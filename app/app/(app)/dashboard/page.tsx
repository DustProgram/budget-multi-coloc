'use client';

import Link from 'next/link';
import { accounts, monthly, balanceCurve, calendarEvents, today, me } from '@/lib/data';
import { eur, eurShort } from '@/lib/format';
import { BalanceCurve } from '@/components/charts/BalanceCurve';
import { Donut } from '@/components/charts/Donut';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icons } from '@/components/shell/icons';

const monthName = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

export default function DashboardPage() {
  const m = monthly;
  const curve = balanceCurve.map(d => d.balance);
  const todayIndex = today.getDate() - 1;
  const totalWealth = accounts.reduce((s, a) => s + a.initial_balance, 0);

  const upcoming = calendarEvents.filter(e => e.date >= today.getDate()).slice(0, 6);
  const labelByType: Record<string, string> = { income: 'Revenu', charge: 'Charge', saving: 'Épargne', purchase: 'Achat' };
  const colorByType: Record<string, string> = { income: 'pill-sage', charge: 'pill-rose', saving: 'pill-plum', purchase: 'pill-amber' };

  return (
    <>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Bonjour {me.name} · {monthName}</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>Tout va bien ce mois-ci.</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            Tu as <strong>{eur(m.available_for_purchases)}</strong> de marge pour les achats spontanés.
            Ton solde projeté fin de mois est <strong>{eur(m.final_balance)}</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn"><Icons.calendar size={14} /> Mai 2026 <Icons.chevD size={14} /></button>
          <Link href="/simulator" className="btn btn-primary"><Icons.calc size={14} /> Puis-je acheter ?</Link>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="kpi kpi-tinted" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', letterSpacing: '.02em' }}>
            <Icons.wallet size={13} /> Patrimoine total
          </div>
          <div className="display num" style={{ fontSize: 52, lineHeight: 1 }}>{eur(totalWealth)}</div>
          <div className="pos" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            ↗ +{eur(m.final_balance - m.initial_balance)} ce mois
          </div>
          <Sparkline data={curve} color="var(--terra)" width={140} height={36} fill />
        </div>
        {[
          { label: 'Revenus', icon: <Icons.trending size={13} />, value: eurShort(m.incomes), sub: '2 sources' },
          { label: 'Charges', icon: <Icons.receipt size={13} />, value: eurShort(m.charges_perso + m.charges_coloc), sub: `dont ${eurShort(m.charges_coloc)} coloc` },
          { label: 'Épargne', icon: <Icons.piggy size={13} />, value: eurShort(m.savings), sub: '↗ programmée le 27', subClass: 'pos' },
          { label: 'Achats', icon: <Icons.cart size={13} />, value: eurShort(m.purchases_imputed), sub: '4 transactions' },
        ].map(kpi => (
          <div key={kpi.label} className="kpi">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)', letterSpacing: '.02em' }}>
              {kpi.icon} {kpi.label}
            </div>
            <div className="display num" style={{ fontSize: 34, lineHeight: 1 }}>{kpi.value}</div>
            <div className={`small ${kpi.subClass || 'muted'}`}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Balance curve + accounts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Solde projeté · Compte courant</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>12 mai 2026 — projection jusqu&apos;au 31</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="pill">Courant</span>
              <span className="pill pill-sage">+{eurShort(curve[curve.length - 1] - curve[0])}</span>
            </div>
          </div>
          <BalanceCurve data={balanceCurve} todayIndex={todayIndex} />
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Mes comptes</div>
            <Link href="/accounts" className="btn btn-ghost btn-sm">Tout voir <Icons.arrow size={12} /></Link>
          </div>
          {accounts.map(a => (
            <Link key={a.id} href="/accounts" style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto auto', gap: 14, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-sunken)', color: 'var(--ink-2)' }}>
                <Icons.building size={14} />
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{a.name}</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>{a.bank} · {a.type}</div>
              </div>
              <Sparkline data={[a.initial_balance * 0.95, a.initial_balance * 0.98, a.initial_balance, a.initial_balance * 1.02, a.initial_balance * 1.05]} color={`var(--${a.color === 'ink' ? 'terra' : a.color})`} />
              <div className="num" style={{ fontFamily: 'var(--display)', fontSize: 18, textAlign: 'right' }}>{eur(a.initial_balance)}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Donut + upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <div className="card">
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Répartition des dépenses</div>
          <Donut data={[
            { label: 'Charges coloc', value: m.charges_coloc, color: 'var(--rose)' },
            { label: 'Charges perso', value: m.charges_perso, color: 'var(--terra)' },
            { label: 'Épargne', value: m.savings, color: 'var(--plum)' },
            { label: 'Achats', value: m.purchases_imputed, color: 'var(--amber)' },
          ]} />
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Prochains mouvements</div>
            <Link href="/calendar" className="btn btn-ghost btn-sm">Voir agenda <Icons.arrow size={12} /></Link>
          </div>
          {upcoming.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ width: 38, textAlign: 'center', fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink-3)' }}>{e.date}</div>
              <span className={`pill ${colorByType[e.type]}`}>{labelByType[e.type]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{e.label}</div>
                <div className="small muted">{e.account}</div>
              </div>
              <div className={`num ${e.amount >= 0 ? 'pos' : ''}`} style={{ fontFamily: 'var(--display)', fontSize: 17 }}>
                {eur(e.amount, { sign: true })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
