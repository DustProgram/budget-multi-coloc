'use client';

import { accounts, users, me } from '@/lib/data';
import { eur } from '@/lib/format';
import { AvatarStack } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkline } from '@/components/charts/Sparkline';
import { Icons } from '@/components/shell/icons';
import { useTweaks } from '@/lib/tweaks-context';

export default function AccountsPage() {
  const { tweaks } = useTweaks();
  const space = tweaks.space;
  const filtered = accounts.filter(a => a.space === space);
  const total = filtered.reduce((s, a) => s + a.initial_balance, 0);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="eyebrow">Comptes · {space === 'pro' ? 'Pro' : 'Perso'}</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 1, letterSpacing: '-0.02em', margin: '6px 0 6px' }}>{eur(total)}</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, margin: 0 }}>
            Réparti sur {filtered.length} compte{filtered.length > 1 ? 's' : ''}. Les comptes joints sont liés à plusieurs utilisateurs.
          </p>
        </div>
        <button className="btn btn-primary"><Icons.plus size={14} /> Ajouter un compte</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icons.wallet size={28} />}
          title={`Aucun compte ${space}`}
          body={`Ajoute ton premier compte ${space === 'pro' ? 'professionnel (Qonto, Shine, etc.)' : 'personnel ou joint'} pour commencer.`}
          action="Ajouter un compte"
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(a => {
            const members = a.members || [me.id];
            const joint = members.length > 1;
            return (
              <div key={a.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span className="pill">{a.type}</span>
                  <span className="small muted">{a.bank}</span>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 32 }}>{eur(a.initial_balance)}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{a.name}</div>
                <Sparkline
                  data={[a.initial_balance * 0.92, a.initial_balance * 0.95, a.initial_balance * 0.97, a.initial_balance, a.initial_balance * 1.03, a.initial_balance * 1.04]}
                  color={`var(--${a.color === 'ink' ? 'terra' : a.color})`}
                  width={240} height={48} fill
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div className="small muted">{joint ? `${members.length} co-titulaires` : 'Titulaire unique'}</div>
                  <AvatarStack ids={members} users={users} size={22} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Future joint account feature card */}
      <div className="card" style={{ marginTop: 16, background: 'var(--accent-bg)', border: '1px dashed var(--line-strong)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">À venir</p>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '4px 0 6px' }}>Comptes joints multi-utilisateurs</h3>
            <p className="muted" style={{ maxWidth: 520, margin: 0 }}>
              Chaque compte joint sera directement lié aux profils de ses titulaires. Les charges payées s&apos;affecteront automatiquement à chaque coloc, et les soldes seront synchronisés en temps réel.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div className="small muted">Utilisateurs liés au compte joint</div>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={`avatar avatar-${u.color}`} style={{ width: 22, height: 22, fontSize: 11 }}>{u.initial}</div>
                <span style={{ fontSize: 14 }}>{u.name}</span>
                <span className="pill" style={{ marginLeft: 'auto', fontSize: 11 }}>Actif</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
