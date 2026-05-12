// Main app — routing, theme, tweaks integration
const { useState: useS, useEffect: useEf } = React;

function App() {
  const [route, setRoute] = useS(() => {
    const h = window.location.hash.slice(1);
    return h || 'dashboard';
  });
  const [collapsed, setCollapsed] = useS(false);
  const [menuOpen, setMenuOpen] = useS(false);

  // Tweaks
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "doux",
    "accent": "terra",
    "density": "balanced",
    "serif_titles": true,
    "animations": true,
    "space": "perso"
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const space = t.space || 'perso';
  const setSpace = (s) => setTweak('space', s);
  // Expose globally for pages that need to filter
  window.__SPACE__ = space;

  useEf(() => {
    document.documentElement.dataset.theme = t.theme === 'doux' ? '' : t.theme;
    const root = document.documentElement.style;
    const hueMap = { terra: 40, sage: 150, plum: 320, ink: 60 };
    const accentMap = {
      terra: 'oklch(0.62 0.12 40)',
      sage: 'oklch(0.55 0.08 150)',
      plum: 'oklch(0.55 0.09 320)',
      ink: t.theme === 'night' ? '#f5f1e8' : '#1c1917',
    };
    const hue = hueMap[t.accent] ?? 40;
    const accent = accentMap[t.accent] || accentMap.terra;
    const accentBg = t.theme === 'night'
      ? `oklch(0.28 0.06 ${hue})`
      : t.theme === 'sobre'
      ? `oklch(0.96 0.02 ${hue})`
      : `oklch(0.94 0.04 ${hue})`;
    root.setProperty('--accent', accent);
    root.setProperty('--accent-bg', accentBg);
    if (!t.serif_titles) {
      root.setProperty('--display', "'Geist', system-ui, sans-serif");
    } else {
      root.removeProperty('--display');
    }
    document.documentElement.dataset.anim = t.animations ? 'on' : 'off';
    document.documentElement.dataset.space = space;
  }, [t.theme, t.accent, t.serif_titles, t.animations, space]);

  useEf(() => {
    window.location.hash = route;
    window.scrollTo(0, 0);
  }, [route]);

  const pages = {
    dashboard: <Dashboard setRoute={setRoute} space={space}/>,
    calendar: <CalendarPage space={space}/>,
    yearly: <YearlyPage space={space}/>,
    accounts: <AccountsPage space={space}/>,
    incomes: <IncomesPage space={space}/>,
    charges: <ChargesPage space={space}/>,
    transfers: <TransfersPage/>,
    savings: <SavingsPage/>,
    purchases: <PurchasesPage/>,
    simulator: <SimulatorPage/>,
    coloc: <ColocPage/>,
    shopping: <ShoppingPage/>,
    comptapro: <ComptaProPage/>,
  };

  const titles = {
    dashboard: 'Accueil', calendar: 'Calendrier', yearly: 'Vue année',
    accounts: 'Comptes', incomes: 'Revenus', charges: 'Charges',
    transfers: 'Virements', savings: 'Épargne', purchases: 'Achats',
    simulator: 'Simulateur', coloc: 'Coloc', shopping: 'Courses',
    comptapro: 'Comptabilité pro',
  };

  return (
    <div className="app" data-screen-label={`${route} — ${titles[route]}`}>
      <Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed} space={space} setSpace={setSpace}/>
      <MobileHeader title={titles[route]} route={route} setRoute={setRoute} space={space} setSpace={setSpace}/>
      <main className="main" key={route + space}>
        {pages[route] || <Dashboard setRoute={setRoute} space={space}/>}
      </main>
      <MobileNav route={route} setRoute={setRoute} openMenu={() => setMenuOpen(true)}/>
      <MoreMenu open={menuOpen} onClose={() => setMenuOpen(false)} setRoute={setRoute}/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Thème"/>
        <TweakRadio label="Ambiance" value={t.theme}
          options={['doux', 'night', 'sobre']}
          onChange={(v) => setTweak('theme', v)}/>
        <TweakSection label="Accent"/>
        <TweakColor label="Couleur" value={({terra:'#c97155',sage:'#6e8c70',plum:'#8a6680',ink:'#1c1917'})[t.accent]}
          options={['#c97155', '#6e8c70', '#8a6680', '#1c1917']}
          onChange={(v) => setTweak('accent', ({'#c97155':'terra','#6e8c70':'sage','#8a6680':'plum','#1c1917':'ink'})[v])}/>
        <TweakSection label="Typographie"/>
        <TweakToggle label="Sérif pour les titres" value={t.serif_titles}
          onChange={(v) => setTweak('serif_titles', v)}/>
        <TweakSection label="Mouvements"/>
        <TweakToggle label="Animations de transition" value={t.animations}
          onChange={(v) => setTweak('animations', v)}/>
        <TweakSection label="Espace"/>
        <TweakRadio label="Contexte actif" value={space}
          options={['perso', 'pro']}
          onChange={(v) => setSpace(v)}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
