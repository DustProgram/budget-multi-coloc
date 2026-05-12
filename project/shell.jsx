// Shell, icons, helpers
const { useState, useEffect, useMemo, useRef } = React;

// === Inline SVG icons (Lucide-like, hand-traced) ===
const Icon = ({ d, size = 16, stroke = 1.75 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const I = {
  dashboard: (p) => <Icon {...p} d={["M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z"]} />,
  calendar: (p) => <Icon {...p} d={["M8 2v4","M16 2v4","M3 9h18","M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"]} />,
  wallet: (p) => <Icon {...p} d={["M20 12V8H4a2 2 0 0 1 0-4h12v4","M20 12v8H4a2 2 0 0 1-2-2V6","M18 12a2 2 0 0 0 0 4h4v-4z"]} />,
  trending: (p) => <Icon {...p} d={["M22 7l-9.5 9.5-5-5L1 18","M16 7h6v6"]} />,
  receipt: (p) => <Icon {...p} d={["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z","M8 7h8","M8 11h8","M8 15h5"]} />,
  swap: (p) => <Icon {...p} d={["M17 3l4 4-4 4","M3 7h18","M7 21l-4-4 4-4","M21 17H3"]} />,
  piggy: (p) => <Icon {...p} d={["M19 5c-1.5 0-3 1.5-3 3v.5a3 3 0 0 0-2 .5h-1c-3 0-5 2-5 5v3l-2 1v2h4l1-1h6l1 1h4v-7c0-1-.5-2-1-2.5C21 9.5 22 7.5 21 6c-.5-.5-1-1-2-1z","M18 11h.01"]} />,
  cart: (p) => <Icon {...p} d={["M2 2h2.5l2 12.5a2 2 0 0 0 2 1.5h9a2 2 0 0 0 2-1.5L21 6H6","M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z","M18 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"]} />,
  calc: (p) => <Icon {...p} d={["M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z","M8 6h8","M8 10h2","M14 10h2","M8 14h2","M14 14h2","M8 18h2","M14 18h2"]} />,
  chart: (p) => <Icon {...p} d={["M3 3v18h18","M7 17v-5","M12 17V9","M17 17V6"]} />,
  list: (p) => <Icon {...p} d={["M8 6h13","M8 12h13","M8 18h13","M3 6h.01","M3 12h.01","M3 18h.01"]} />,
  users: (p) => <Icon {...p} d={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]} />,
  chevL: (p) => <Icon {...p} d="M15 18l-6-6 6-6" />,
  chevR: (p) => <Icon {...p} d="M9 18l6-6-6-6" />,
  chevD: (p) => <Icon {...p} d="M6 9l6 6 6-6" />,
  plus: (p) => <Icon {...p} d={["M12 5v14","M5 12h14"]} />,
  check: (p) => <Icon {...p} d="M20 6L9 17l-5-5" />,
  x: (p) => <Icon {...p} d={["M18 6L6 18","M6 6l12 12"]} />,
  arrow: (p) => <Icon {...p} d={["M5 12h14","M12 5l7 7-7 7"]} />,
  search: (p) => <Icon {...p} d={["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z","M21 21l-4.35-4.35"]} />,
  bell: (p) => <Icon {...p} d={["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9","M13.73 21a2 2 0 0 1-3.46 0"]} />,
  sliders: (p) => <Icon {...p} d={["M4 21V14","M4 10V3","M12 21V12","M12 8V3","M20 21V16","M20 12V3","M1 14h6","M9 8h6","M17 16h6"]} />,
  menu: (p) => <Icon {...p} d={["M3 12h18","M3 6h18","M3 18h18"]} />,
  pdf: (p) => <Icon {...p} d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z","M14 2v6h6","M9 13h6","M9 17h6"]} />,
  download: (p) => <Icon {...p} d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M7 10l5 5 5-5","M12 15V3"]} />,
  building: (p) => <Icon {...p} d={["M3 21h18","M5 21V7l8-4v18","M19 21V11l-6-4","M9 9v.01","M9 12v.01","M9 15v.01","M9 18v.01"]} />,
};

// === Format helpers ===
const eur = (v, opts = {}) => {
  const n = Number(v);
  const sign = opts.sign && n > 0 ? '+' : '';
  return sign + new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: opts.dec ?? 2 }).format(n);
};
const eurShort = (v) => {
  const n = Math.abs(Number(v));
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k€';
  return Math.round(n) + '€';
};

// === Sparkline component ===
function Sparkline({ data, color = 'currentColor', width = 80, height = 28, fill = false }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const fillPath = fill ? `${path} L${width} ${height} L0 ${height} Z` : '';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark">
      {fill && <path d={fillPath} fill={color} opacity={0.12} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// === Nav config ===
const NAV = [
  { section: 'Vue', items: [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
    { id: 'calendar', label: 'Calendrier', icon: 'calendar' },
    { id: 'yearly', label: 'Vue annuelle', icon: 'chart' },
  ]},
  { section: 'Mouvements', items: [
    { id: 'accounts', label: 'Comptes', icon: 'wallet' },
    { id: 'incomes', label: 'Revenus', icon: 'trending' },
    { id: 'charges', label: 'Charges', icon: 'receipt' },
    { id: 'transfers', label: 'Virements', icon: 'swap' },
    { id: 'savings', label: 'Épargne', icon: 'piggy' },
    { id: 'purchases', label: 'Achats', icon: 'cart' },
  ]},
  { section: 'Coloc', items: [
    { id: 'coloc', label: 'Récap coloc', icon: 'users' },
    { id: 'shopping', label: 'Courses', icon: 'list' },
  ]},
  { section: 'Outils', items: [
    { id: 'simulator', label: 'Simulateur', icon: 'calc' },
    { id: 'comptapro', label: 'Comptabilité pro', icon: 'building' },
  ]},
];

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Accueil', icon: 'dashboard' },
  { id: 'calendar', label: 'Agenda', icon: 'calendar' },
  { id: 'simulator', label: 'Simul.', icon: 'calc' },
  { id: 'coloc', label: 'Coloc', icon: 'users' },
  { id: 'menu', label: 'Plus', icon: 'menu' },
];

function Sidebar({ route, setRoute, collapsed, setCollapsed, space, setSpace }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <div className="brand-mark">€</div>
        {!collapsed && (
          <div className="brand-name">
            Compte gestion
            <small>Multi-coloc · v1.2</small>
          </div>
        )}
        {!collapsed && (
          <button className="collapse-btn" onClick={() => setCollapsed(true)} title="Réduire">
            <I.chevL size={14} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="space-switcher">
          <button className={`space-tab ${space==='perso' ? 'active' : ''}`} onClick={() => setSpace('perso')}>
            <span className="dot" data-c="perso"/>Perso
          </button>
          <button className={`space-tab ${space==='pro' ? 'active' : ''}`} onClick={() => setSpace('pro')}>
            <span className="dot" data-c="pro"/>Pro
          </button>
        </div>
      )}
      {collapsed && (
        <button className="collapse-btn space-mini" onClick={() => setSpace(space==='perso'?'pro':'perso')} title={`Espace: ${space}`} style={{margin: '0 auto 8px'}}>
          {space==='perso' ? 'P' : 'Pr'}
        </button>
      )}
      {collapsed && (
        <button className="collapse-btn" style={{margin: '0 auto 12px'}} onClick={() => setCollapsed(false)} title="Étendre">
          <I.chevR size={14} />
        </button>
      )}
      <nav style={{flex: 1, overflowY: 'auto'}}>
        {NAV.map(sec => (
          <div className="nav-section" key={sec.section}>
            {!collapsed && <div className="nav-section-label">{sec.section}</div>}
            {sec.items.map(item => {
              const IconCmp = I[item.icon];
              return (
                <button key={item.id} className={`nav-item ${route === item.id ? 'active' : ''}`} onClick={() => setRoute(item.id)} title={collapsed ? item.label : ''}>
                  <IconCmp size={16} />
                  <span className="lbl">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="user-pill" style={{marginTop: 12}}>
        <div className={`avatar ${MOCK.me.color}`}>{MOCK.me.initial}</div>
        {!collapsed && (
          <div className="user-name">
            {MOCK.me.name}
            <small>Coloc · Pixel St-Marc</small>
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileNav({ route, setRoute, openMenu }) {
  return (
    <nav className="mobile-nav">
      {MOBILE_NAV.map(item => {
        const IconCmp = I[item.icon];
        const active = item.id === 'menu' ? false : route === item.id;
        return (
          <button key={item.id} className={`mobile-nav-item ${active ? 'active' : ''}`} onClick={() => item.id === 'menu' ? openMenu() : setRoute(item.id)}>
            <IconCmp size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileHeader({ title, route, setRoute, space, setSpace }) {
  return (
    <header className="mobile-header">
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <div className="brand-mark" style={{width: 28, height: 28, fontSize: 16}}>€</div>
        <strong style={{fontFamily: 'var(--display)', fontSize: 18}}>{title}</strong>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <button onClick={() => setSpace(space==='perso'?'pro':'perso')} className="space-pill-mobile" title="Changer d'espace">
          <span className="dot" data-c={space}/>{space==='perso'?'Perso':'Pro'}
        </button>
        <div className={`avatar ${MOCK.me.color}`} style={{width: 28, height: 28, fontSize: 12}}>{MOCK.me.initial}</div>
      </div>
    </header>
  );
}

// Avatar stack for joint accounts
function AvatarStack({ ids, size = 22 }) {
  const users = ids.map(i => MOCK.users.find(u => u.id === i)).filter(Boolean);
  return (
    <div className="avatar-stack" style={{ '--sz': size + 'px' }}>
      {users.map((u, i) => (
        <div key={u.id} className={`avatar ${u.color}`} style={{width: size, height: size, fontSize: Math.round(size*0.42), marginLeft: i===0?0:-size*0.35, zIndex: users.length - i}} title={u.name}>{u.initial}</div>
      ))}
    </div>
  );
}

// Empty state
function EmptyState({ icon = 'plus', title, body, action, onAction }) {
  const IconCmp = I[icon] || I.plus;
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><IconCmp size={28}/></div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <button className="btn primary" onClick={onAction}>{action}</button>}
    </div>
  );
}

function MoreMenu({ open, onClose, setRoute }) {
  if (!open) return null;
  return (
    <div style={{position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'flex-end'}} onClick={onClose}>
      <div style={{background: 'var(--bg-elev)', width: '100%', borderRadius: '24px 24px 0 0', padding: 20, paddingBottom: 36}} onClick={e => e.stopPropagation()}>
        <div style={{width: 40, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 16px'}} />
        <h3 style={{fontFamily: 'var(--display)', fontSize: 22, margin: '0 0 16px'}}>Toutes les sections</h3>
        {NAV.map(sec => (
          <div key={sec.section} style={{marginBottom: 12}}>
            <div className="nav-section-label" style={{marginBottom: 6}}>{sec.section}</div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6}}>
              {sec.items.map(item => {
                const IconCmp = I[item.icon];
                return (
                  <button key={item.id} className="nav-item" onClick={() => { setRoute(item.id); onClose(); }} style={{background: 'var(--bg-sunken)'}}>
                    <IconCmp size={16} />
                    <span className="lbl">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Icon, I, eur, eurShort, Sparkline, Sidebar, MobileNav, MobileHeader, MoreMenu, AvatarStack, EmptyState });
