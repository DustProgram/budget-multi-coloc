'use client';

import Link from 'next/link';
import { Icons } from './icons';

const NAV = [
  { section: 'Vue', items: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' as const },
    { id: 'calendar', label: 'Calendrier', icon: 'calendar' as const },
    { id: 'yearly', label: 'Vue annuelle', icon: 'chart' as const },
  ]},
  { section: 'Mouvements', items: [
    { id: 'accounts', label: 'Comptes', icon: 'wallet' as const },
    { id: 'incomes', label: 'Revenus', icon: 'trending' as const },
    { id: 'charges', label: 'Charges', icon: 'receipt' as const },
    { id: 'transfers', label: 'Virements', icon: 'swap' as const },
    { id: 'savings', label: 'Épargne', icon: 'piggy' as const },
    { id: 'purchases', label: 'Achats', icon: 'cart' as const },
  ]},
  { section: 'Coloc', items: [
    { id: 'coloc', label: 'Récap coloc', icon: 'users' as const },
    { id: 'shopping', label: 'Courses', icon: 'list' as const },
  ]},
  { section: 'Outils', items: [
    { id: 'simulator', label: 'Simulateur', icon: 'calc' as const },
    { id: 'compta-pro', label: 'Comptabilité pro', icon: 'building' as const },
  ]},
];

interface MoreMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MoreMenu({ open, onClose }: MoreMenuProps) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-elev)', width: '100%',
        borderRadius: '24px 24px 0 0', padding: 20, paddingBottom: 36,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: '0 0 16px' }}>Toutes les sections</h3>
        {NAV.map(sec => (
          <div key={sec.section} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 6 }}>{sec.section}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {sec.items.map(item => {
                const IconCmp = Icons[item.icon];
                return (
                  <Link key={item.id} href={`/${item.id}`} onClick={onClose} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 9,
                    color: 'var(--ink-2)', textDecoration: 'none', fontSize: 13.5,
                    background: 'var(--bg-sunken)',
                  }}>
                    <IconCmp size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
