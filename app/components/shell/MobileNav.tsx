'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from './icons';

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Accueil', icon: 'dashboard' as const },
  { id: 'calendar', label: 'Agenda', icon: 'calendar' as const },
  { id: 'simulator', label: 'Simul.', icon: 'calc' as const },
  { id: 'coloc', label: 'Coloc', icon: 'users' as const },
];

interface MobileNavProps {
  onMenuOpen: () => void;
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname();
  const current = pathname.slice(1) || 'dashboard';

  return (
    <nav style={{
      display: 'none',
      position: 'fixed',
      bottom: 12, left: 12, right: 12,
      background: 'var(--bg-elev)',
      border: '1px solid var(--line)',
      borderRadius: 18,
      padding: 6,
      zIndex: 10,
      boxShadow: 'var(--shadow)',
      justifyContent: 'space-around',
    }} className="mobile-nav">
      {MOBILE_NAV.map(item => {
        const IconCmp = Icons[item.icon];
        const isActive = current === item.id;
        return (
          <Link key={item.id} href={`/${item.id}`} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '8px 0', textDecoration: 'none', fontSize: 10,
            color: isActive ? 'var(--bg)' : 'var(--ink-3)',
            background: isActive ? 'var(--ink)' : 'transparent',
            borderRadius: 12,
          }}>
            <IconCmp size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button onClick={onMenuOpen} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '8px 0', border: 'none', background: 'transparent', fontSize: 10,
        color: 'var(--ink-3)', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <Icons.menu size={20} />
        <span>Plus</span>
      </button>
    </nav>
  );
}
