'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from './icons';
import { me } from '@/lib/data';

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

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  space: 'perso' | 'pro';
  setSpace: (s: 'perso' | 'pro') => void;
}

export function Sidebar({ collapsed, setCollapsed, space, setSpace }: SidebarProps) {
  const pathname = usePathname();
  const current = pathname.replace('/app/', '').replace('/', '');

  return (
    <aside style={{
      width: collapsed ? 64 : 232,
      background: 'var(--bg)',
      borderRight: '1px solid var(--line)',
      display: 'flex',
      flexDirection: 'column',
      padding: collapsed ? '18px 8px' : '18px 14px',
      position: 'sticky',
      top: 0,
      height: '100vh',
      transition: 'width .2s ease',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 18px', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: 'var(--ink)', color: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--display)', fontSize: 18, flexShrink: 0,
        }}>€</div>
        {!collapsed && (
          <>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '-0.01em', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              Compte gestion
              <small style={{ display: 'block', fontFamily: 'var(--body)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginTop: -2 }}>
                Multi-coloc · v2.0
              </small>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              style={{ border: '1px solid var(--line)', background: 'var(--bg-elev)', width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', color: 'var(--ink-3)', cursor: 'pointer' }}
            >
              <Icons.chevL size={14} />
            </button>
          </>
        )}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            style={{ border: '1px solid var(--line)', background: 'var(--bg-elev)', width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: 'var(--ink-3)', cursor: 'pointer' }}
          >
            <Icons.chevR size={14} />
          </button>
        )}
      </div>

      {/* Space switcher */}
      {!collapsed ? (
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-sunken)', borderRadius: 12, margin: '4px 12px 16px', border: '1px solid var(--line)' }}>
          {(['perso', 'pro'] as const).map(s => (
            <button key={s} onClick={() => setSpace(s)} style={{
              flex: 1, padding: '7px 10px', border: 0, borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: space === s ? 'var(--bg-elev)' : 'transparent',
              color: space === s ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: space === s ? 'var(--shadow-sm)' : 'none',
              transition: 'background .18s ease, color .18s ease',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s === 'perso' ? 'var(--terra)' : 'var(--plum)' }} />
              {s === 'perso' ? 'Perso' : 'Pro'}
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setSpace(space === 'perso' ? 'pro' : 'perso')}
          style={{ border: '1px solid var(--line)', background: 'var(--bg-elev)', width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          {space === 'perso' ? 'P' : 'Pr'}
        </button>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map(sec => (
          <div key={sec.section} style={{ marginTop: 14 }}>
            {!collapsed && (
              <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)', padding: '0 10px 6px' }}>
                {sec.section}
              </div>
            )}
            {sec.items.map(item => {
              const IconCmp = Icons[item.icon];
              const isActive = current === item.id || (current === '' && item.id === 'dashboard');
              return (
                <Link key={item.id} href={`/${item.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 9,
                    color: isActive ? 'var(--bg)' : 'var(--ink-2)',
                    textDecoration: 'none', fontSize: 13.5,
                    background: isActive ? 'var(--ink)' : 'transparent',
                    marginBottom: 2, transition: 'background .12s ease, color .12s ease',
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <IconCmp size={16} />
                  {!collapsed && <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User pill */}
      <div style={{
        marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
        padding: 8, borderRadius: 11, background: 'var(--bg-sunken)',
      }}>
        <div className={`avatar avatar-${me.color}`} style={{ width: 30, height: 30, fontSize: 13 }}>{me.initial}</div>
        {!collapsed && (
          <div style={{ fontSize: 13 }}>
            {me.name}
            <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: 11 }}>Coloc · Pixel St-Marc</small>
          </div>
        )}
      </div>
    </aside>
  );
}
