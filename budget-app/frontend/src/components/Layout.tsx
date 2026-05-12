import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, CalendarDays, CreditCard, TrendingUp, FileText,
  ArrowLeftRight, PiggyBank, ShoppingBag, Calculator, BarChart3,
  ListChecks, Users, ChevronLeft, ChevronRight, Menu, X,
} from 'lucide-react';
import { TweaksPanel } from './TweaksPanel';
import { OfflineBadge } from './OfflineBadge';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  section: 'Vue' | 'Mouvements' | 'Coloc' | 'Outils';
}

const NAV: NavItem[] = [
  { to: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, section: 'Vue' },
  { to: 'calendar', label: 'Calendrier', icon: CalendarDays, section: 'Vue' },
  { to: 'monthly', label: 'Vue mensuelle', icon: BarChart3, section: 'Vue' },
  { to: 'yearly', label: 'Vue annuelle', icon: BarChart3, section: 'Vue' },
  { to: 'accounts', label: 'Comptes', icon: CreditCard, section: 'Mouvements' },
  { to: 'incomes', label: 'Revenus', icon: TrendingUp, section: 'Mouvements' },
  { to: 'charges', label: 'Charges', icon: FileText, section: 'Mouvements' },
  { to: 'transfers', label: 'Virements', icon: ArrowLeftRight, section: 'Mouvements' },
  { to: 'savings', label: 'Épargne', icon: PiggyBank, section: 'Mouvements' },
  { to: 'purchases', label: 'Achats', icon: ShoppingBag, section: 'Mouvements' },
  { to: 'coloc', label: 'Récap coloc', icon: Users, section: 'Coloc' },
  { to: 'shopping', label: 'Courses', icon: ListChecks, section: 'Coloc' },
  { to: 'simulator', label: 'Simulateur', icon: Calculator, section: 'Outils' },
];

const SECTIONS: NavItem['section'][] = ['Vue', 'Mouvements', 'Coloc', 'Outils'];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname.split('/').filter(Boolean).pop() || 'dashboard';
  const currentTitle = NAV.find((n) => n.to === currentPath)?.label || 'Tableau de bord';

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">€</div>
          {!collapsed && (
            <>
              <div className="brand-name">
                Budget Coloc
                <small>HA · v0.1</small>
              </div>
              <button
                className="collapse-btn"
                onClick={() => setCollapsed(true)}
                aria-label="Réduire"
              >
                <ChevronLeft size={14} />
              </button>
            </>
          )}
          {collapsed && (
            <button
              className="collapse-btn"
              style={{ margin: '0 auto' }}
              onClick={() => setCollapsed(false)}
              aria-label="Étendre"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {SECTIONS.map((sec) => (
            <div key={sec} className="nav-section">
              {!collapsed && <div className="nav-section-label">{sec}</div>}
              {NAV.filter((n) => n.section === sec).map((item) => {
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
          <div style={{ width: 32 }} />
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(28,25,23,.5)',
            zIndex: 20, display: 'flex',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(82vw, 280px)', background: 'var(--bg)', padding: 18,
              display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>Menu</span>
              <button className="btn icon" onClick={() => setMobileOpen(false)} aria-label="Fermer">
                <X size={14} />
              </button>
            </div>
            {SECTIONS.map((sec) => (
              <div key={sec}>
                <div className="nav-section-label">{sec}</div>
                {NAV.filter((n) => n.section === sec).map((item) => {
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

      <TweaksPanel />
      <OfflineBadge />

      {/* Bottom mobile nav (toggle + few quick links) */}
      <div className="mobile-nav">
        {[
          NAV.find((n) => n.to === 'dashboard')!,
          NAV.find((n) => n.to === 'calendar')!,
          NAV.find((n) => n.to === 'shopping')!,
          NAV.find((n) => n.to === 'coloc')!,
        ].map((item) => {
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
