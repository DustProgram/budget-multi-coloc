'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { MobileHeader } from './MobileHeader';
import { MoreMenu } from './MoreMenu';
import { TweaksPanel } from '@/components/tweaks/TweaksPanel';
import { useTweaks } from '@/lib/tweaks-context';

const TITLES: Record<string, string> = {
  dashboard: 'Accueil',
  calendar: 'Calendrier',
  yearly: 'Vue année',
  accounts: 'Comptes',
  incomes: 'Revenus',
  charges: 'Charges',
  transfers: 'Virements',
  savings: 'Épargne',
  purchases: 'Achats',
  simulator: 'Simulateur',
  coloc: 'Coloc',
  shopping: 'Courses',
  'compta-pro': 'Comptabilité pro',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { tweaks, setTweak } = useTweaks();
  const pathname = usePathname();
  const currentPage = pathname.slice(1) || 'dashboard';
  const space = tweaks.space;
  const setSpace = (s: 'perso' | 'pro') => setTweak('space', s);
  const title = TITLES[currentPage] || 'Accueil';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        space={space}
        setSpace={setSpace}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <MobileHeader title={title} space={space} setSpace={setSpace} />
        <main className="main-content" style={{ padding: '28px 36px 96px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          {children}
        </main>
      </div>
      <MobileNav onMenuOpen={() => setMenuOpen(true)} />
      <MoreMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <TweaksPanel />
    </div>
  );
}
