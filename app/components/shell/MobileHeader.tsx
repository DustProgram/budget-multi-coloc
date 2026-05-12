'use client';

import { me } from '@/lib/data';

interface MobileHeaderProps {
  title: string;
  space: 'perso' | 'pro';
  setSpace: (s: 'perso' | 'pro') => void;
}

export function MobileHeader({ title, space, setSpace }: MobileHeaderProps) {
  return (
    <header style={{
      display: 'none',
      position: 'sticky', top: 0, zIndex: 9,
      background: 'var(--bg)',
      borderBottom: '1px solid var(--line)',
      padding: '12px 16px',
      alignItems: 'center', justifyContent: 'space-between',
    }} className="mobile-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9,
          background: 'var(--ink)', color: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--display)', fontSize: 16,
        }}>€</div>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{title}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setSpace(space === 'perso' ? 'pro' : 'perso')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 999,
          border: '1px solid var(--line-strong)',
          background: 'var(--bg-elev)',
          fontSize: 12, fontWeight: 500, color: 'var(--ink-2)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: space === 'perso' ? 'var(--terra)' : 'var(--plum)' }} />
          {space === 'perso' ? 'Perso' : 'Pro'}
        </button>
        <div className={`avatar avatar-${me.color}`} style={{ width: 28, height: 28, fontSize: 12 }}>{me.initial}</div>
      </div>
    </header>
  );
}
