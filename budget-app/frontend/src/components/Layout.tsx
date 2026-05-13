import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, CalendarDays, CreditCard, TrendingUp, FileText,
  ArrowLeftRight, PiggyBank, ShoppingBag, Calculator, BarChart3,
  ListChecks, Users, ChevronLeft, ChevronRight, Menu, X, Briefcase,
  Settings as SettingsIcon, Sparkles, ListOrdered, Camera, FileSpreadsheet,
} from 'lucide-react';
import { TweaksPanel } from './TweaksPanel';
import { OfflineBadge } from './OfflineBadge';
import { useSpace } from '../lib/space';
import { api } from '../lib/api';
import type { Me } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  section: 'Vue' | 'Mouvements' | 'Coloc' | 'Outils' | 'Pro' | 'Assistant';
  proOnly?: boolean;
  colocAllowed: boolean;  // visible en scope coloc
}

const NAV: NavItem[] = [
  { to: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, section: 'Vue', colocAllowed: false },
  { to: 'calendar', label: 'Calendrier', icon: CalendarDays, section: 'Vue', colocAllowed: false },
  { to: 'events', label: 'Événements', icon: ListOrdered, section: 'Vue', colocAllowed: false },
  { to: 'monthly', label: 'Vue mensuelle', icon: BarChart3, section: 'Vue', colocAllowed: false },
  { to: 'yearly', label: 'Vue annuelle', icon: BarChart3, section: 'Vue', colocAllowed: false },
  { to: 'accounts', label: 'Comptes', icon: CreditCard, section: 'Mouvements', colocAllowed: false },
  { to: 'incomes', label: 'Revenus', icon: TrendingUp, section: 'Mouvements', colocAllowed: false },
  { to: 'charges', label: 'Charges', icon: FileText, section: 'Mouvements', colocAllowed: false },
  { to: 'transfers', label: 'Virements', icon: ArrowLeftRight, section: 'Mouvements', colocAllowed: false },
  { to: 'savings', label: 'Épargne', icon: PiggyBank, section: 'Mouvements', colocAllowed: false },
  { to: 'purchases', label: 'Achats', icon: ShoppingBag, section: 'Mouvements', colocAllowed: false },
  { to: 'coloc', label: 'Récap coloc', icon: Users, section: 'Coloc', colocAllowed: true },
  { to: 'shopping', label: 'Courses', icon: ListChecks, section: 'Coloc', colocAllowed: true },
  { to: 'simulator', label: 'Simulateur', icon: Calculator, section: 'Outils', colocAllowed: false },
  { to: 'chat', label: 'Assistant IA', icon: Sparkles, section: 'Assistant', colocAllowed: false },
  { to: 'import', label: 'Import auto', icon: Camera, section: 'Assistant', colocAllowed: false },
  { to: 'bulk-import', label: 'Import Excel', icon: FileSpreadsheet, section: 'Assistant', colocAllowed: false },
  { to: 'settings', label: 'Réglages', icon: SettingsIcon, section: 'Outils', colocAllowed: false },
  { to: 'compta-pro', label: 'Compta-pro', icon: Briefcase, section: 'Pro', proOnly: true, colocAllowed: false },
];

const SECTIONS: NavItem['section'][] = ['Vue', 'Mouvements', 'Coloc', 'Pro', 'Assistant', 'Outils'];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { space, setSpace } = useSpace();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<Me>('/users/me')).data,
  });
  const versionQ = useQuery({
    queryKey: ['version'],
    queryFn: async () => (await api.get<{ version: string }>('/health/version')).data,
    staleTime: 60 * 60_000,
  });
  const proEnabled = me.data?.pro_enabled ?? false;
  const sessionScope = me.data?.session_scope ?? 'full';
  const isColocSession = sessionScope === 'coloc';

  const currentPath = location.pathname.split('/').filter(Boolean).pop() || 'dashboard';

  // En scope coloc, certaines routes sont interdites → redirect vers shopping
  if (isColocSession && currentPath && !NAV.find((n) => n.to === currentPath && n.colocAllowed)) {
    return <Navigate to="/shopping" replace />;
  }

  const currentTitle = NAV.find((n) => n.to === currentPath)?.label || 'Tableau de bord';

  const visibleNav = NAV.filter((n) => {
    if (isColocSession) return n.colocAllowed;
    if (n.proOnly && !proEnabled) return false;
    return true;
  });
  const visibleSections = SECTIONS.filter((s) => visibleNav.some((n) => n.section === s));

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">€</div>
          {!collapsed && (
            <>
              <div className="brand-name">
                Budget Coloc
                <small>
                  {isColocSession ? 'Mode coloc' : `HA · v${versionQ.data?.version ?? '...'}`}
                </small>
              </div>
              <button className="collapse-btn" onClick={() => setCollapsed(true)} aria-label="Réduire">
                <ChevronLeft size={14} />
              </button>
            </>
          )}
          {collapsed && (
            <button className="collapse-btn" style={{ margin: '0 auto' }}
              onClick={() => setCollapsed(false)} aria-label="Étendre">
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Switcher Perso/Pro — masqué en scope coloc */}
        {!isColocSession && proEnabled && !collapsed && (
          <div className="space-switcher">
            {(['perso', 'pro'] as const).map((s) => (
              <button key={s}
                className={`space-tab ${space === s ? 'active' : ''}`}
                onClick={() => setSpace(s)}
              >
                <span className="dot" data-c={s} />
                {s === 'perso' ? 'Perso' : 'Pro'}
              </button>
            ))}
          </div>
        )}

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {visibleSections.map((sec) => (
            <div key={sec} className="nav-section">
              {!collapsed && <div className="nav-section-label">{sec}</div>}
              {visibleNav.filter((n) => n.section === sec).map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={16} />
                    {!collapsed && <span className="lbl">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="mobile-header">
          <button className="btn icon" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu size={16} />
          </button>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{currentTitle}</div>
          {!isColocSession && proEnabled ? (
            <button
              className="space-pill-mobile"
              onClick={() => setSpace(space === 'perso' ? 'pro' : 'perso')}
              title="Basculer Perso / Pro"
            >
              <span className="dot" data-c={space} />
              {space === 'perso' ? 'Perso' : 'Pro'}
            </button>
          ) : <div style={{ width: 32 }} />}
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(28,25,23,.5)',
            zIndex: 20, display: 'flex',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 'min(82vw, 280px)', background: 'var(--bg)', padding: 18,
            display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>Menu</span>
              <button className="btn icon" onClick={() => setMobileOpen(false)} aria-label="Fermer">
                <X size={14} />
              </button>
            </div>
            {visibleSections.map((sec) => (
              <div key={sec}>
                <div className="nav-section-label">{sec}</div>
                {visibleNav.filter((n) => n.section === sec).map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to} to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={16} />
                      <span className="lbl">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isColocSession && <TweaksPanel />}
      <OfflineBadge />

      <div className="mobile-nav">
        {(isColocSession
          ? [
              visibleNav.find((n) => n.to === 'shopping')!,
              visibleNav.find((n) => n.to === 'coloc')!,
            ].filter(Boolean)
          : [
              visibleNav.find((n) => n.to === 'dashboard')!,
              visibleNav.find((n) => n.to === 'calendar')!,
              visibleNav.find((n) => n.to === 'shopping')!,
              visibleNav.find((n) => n.to === 'coloc')!,
            ].filter(Boolean)
        ).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label.split(' ')[0]}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
