// All pages for Compte Gestion
const { useState: uS, useMemo: uM, useEffect: uE } = React;

// === DASHBOARD ===
function Dashboard({ setRoute }) {
  const m = MOCK.monthly;
  const curve = MOCK.balance_curve.map(d => d.balance);
  const today = MOCK.today;
  const monthName = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Bonjour {MOCK.me.name} · {monthName}</p>
          <h1 className="page-title">Tout va bien ce mois-ci.</h1>
          <p className="page-sub">Tu as <strong>{eur(m.available_for_purchases)}</strong> de marge pour les achats spontanés. Ton solde projeté fin de mois est <strong>{eur(m.final_balance)}</strong>.</p>
        </div>
        <div className="row gap-2 hide-mobile">
          <button className="btn"><I.calendar size={14}/> Mai 2026 <I.chevD size={14}/></button>
          <button className="btn primary" onClick={() => setRoute('simulator')}><I.calc size={14}/> Puis-je acheter ?</button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid mb-6" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
        <div className="kpi large tinted" style={{gridColumn: 'span 2'}}>
          <div className="kpi-label"><I.wallet size={13}/> Patrimoine total</div>
          <div className="kpi-value display num">{eur(MOCK.accounts.reduce((s,a) => s + a.initial_balance, 0))}</div>
          <div className="kpi-delta pos">↗ +{eur(m.final_balance - m.initial_balance)} ce mois</div>
          <Sparkline data={curve} color="var(--terra)" width={140} height={36} fill />
        </div>
        <div className="kpi">
          <div className="kpi-label"><I.trending size={13}/> Revenus</div>
          <div className="kpi-value display num">{eurShort(m.incomes)}</div>
          <div className="kpi-delta muted">2 sources</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><I.receipt size={13}/> Charges</div>
          <div className="kpi-value display num">{eurShort(m.charges_perso + m.charges_coloc)}</div>
          <div className="kpi-delta muted">dont {eurShort(m.charges_coloc)} coloc</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><I.piggy size={13}/> Épargne</div>
          <div className="kpi-value display num">{eurShort(m.savings)}</div>
          <div className="kpi-delta pos">↗ programmée le 27</div>
        </div>
        <div className="kpi">
          <div className="kpi-label"><I.cart size={13}/> Achats</div>
          <div className="kpi-value display num">{eurShort(m.purchases_imputed)}</div>
          <div className="kpi-delta muted">4 transactions</div>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns: '2fr 1fr'}}>
        {/* Balance curve */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Solde projeté · Compte courant</div>
              <div className="card-sub">12 mai 2026 — projection jusqu'au 31</div>
            </div>
            <div className="row gap-2">
              <span className="pill">Courant</span>
              <span className="pill sage">+{eur(curve[curve.length-1] - curve[0]).replace('+', '')}</span>
            </div>
          </div>
          <BalanceChart data={MOCK.balance_curve} />
        </div>

        {/* Accounts */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Mes comptes</div>
            <button className="btn ghost sm" onClick={() => setRoute('accounts')}>Tout voir <I.arrow size={12}/></button>
          </div>
          {MOCK.accounts.map(a => (
            <div key={a.id} className="acct-row" onClick={() => setRoute('accounts')} style={{cursor: 'pointer'}}>
              <div className="acct-icon"><I.building size={14}/></div>
              <div>
                <div className="acct-name">{a.name}</div>
                <div className="acct-sub">{a.bank} · {a.type}</div>
              </div>
              <Sparkline data={[a.initial_balance*0.95, a.initial_balance*0.98, a.initial_balance, a.initial_balance*1.02, a.initial_balance*1.05]} color={`var(--${a.color === 'ink' ? 'terra' : a.color})`} />
              <div className="num right" style={{fontFamily: 'var(--display)', fontSize: 18}}>{eur(a.initial_balance)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid mt-6" style={{gridTemplateColumns: '1fr 1fr 1fr'}}>
        <div className="card">
          <div className="card-head"><div className="card-title">Répartition des dépenses</div></div>
          <Donut data={[
            { label: 'Charges coloc', value: m.charges_coloc, color: 'var(--rose)' },
            { label: 'Charges perso', value: m.charges_perso, color: 'var(--terra)' },
            { label: 'Épargne', value: m.savings, color: 'var(--plum)' },
            { label: 'Achats', value: m.purchases_imputed, color: 'var(--amber)' },
          ]} />
        </div>
        <div className="card" style={{gridColumn: 'span 2'}}>
          <div className="card-head">
            <div className="card-title">Prochains mouvements</div>
            <button className="btn ghost sm" onClick={() => setRoute('calendar')}>Voir agenda <I.arrow size={12}/></button>
          </div>
          <UpcomingList />
        </div>
      </div>
    </>
  );
}

function BalanceChart({ data }) {
  const w = 600, h = 200, pad = 24;
  const today = MOCK.today.getDate();
  const vals = data.map(d => d.balance);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const x = i => pad + (i / (data.length - 1)) * (w - 2*pad);
  const y = v => pad + (1 - (v - min) / range) * (h - 2*pad);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.balance).toFixed(1)}`).join(' ');
  const fillPath = `${path} L${x(data.length-1)} ${h-pad} L${x(0)} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width: '100%', height: 'auto'}}>
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--terra)" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="var(--terra)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(p => (
        <line key={p} x1={pad} x2={w-pad} y1={pad + p*(h-2*pad)} y2={pad + p*(h-2*pad)} stroke="var(--line)" strokeDasharray="2 4"/>
      ))}
      <path d={fillPath} fill="url(#grad)"/>
      <path d={path} fill="none" stroke="var(--terra)" strokeWidth="2" strokeLinecap="round"/>
      <line x1={x(today-1)} x2={x(today-1)} y1={pad} y2={h-pad} stroke="var(--ink)" strokeDasharray="3 3"/>
      <circle cx={x(today-1)} cy={y(data[today-1].balance)} r="5" fill="var(--ink)"/>
      <text x={x(today-1)+8} y={y(data[today-1].balance)-8} fontSize="11" fill="var(--ink)" fontFamily="var(--display)">Aujourd'hui · {eur(data[today-1].balance, {dec: 0})}</text>
      {[1, 5, 10, 15, 20, 25, 30].map(d => (
        <text key={d} x={x(d-1)} y={h-4} fontSize="10" fill="var(--ink-3)" textAnchor="middle">{d}</text>
      ))}
    </svg>
  );
}

function Donut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 60, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
      <svg viewBox="0 0 160 160" width="160" height="160" style={{flexShrink: 0}}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="20"/>
        {data.map((d, i) => {
          const frac = d.value / total;
          const len = frac * c;
          const el = (
            <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={d.color} strokeWidth="20"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="13" fill="var(--ink-3)">Total</text>
        <text x="80" y="98" textAnchor="middle" fontSize="20" fontFamily="var(--display)" fill="var(--ink)">{eurShort(total)}</text>
      </svg>
      <div style={{flex: 1}}>
        {data.map((d, i) => (
          <div key={i} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0'}}>
            <div className="row gap-2"><span style={{width: 8, height: 8, borderRadius: 2, background: d.color}}/>{d.label}</div>
            <span className="num small">{eur(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UpcomingList() {
  const upcoming = MOCK.calendar_events.filter(e => e.date >= MOCK.today.getDate()).slice(0, 6);
  const labelByType = { income: 'Revenu', charge: 'Charge', saving: 'Épargne', purchase: 'Achat' };
  const colorByType = { income: 'sage', charge: 'rose', saving: 'plum', purchase: 'amber' };
  return (
    <div>
      {upcoming.map((e, i) => (
        <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)'}}>
          <div style={{width: 38, textAlign: 'center', fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink-3)'}}>{e.date}</div>
          <span className={`pill ${colorByType[e.type]}`}>{labelByType[e.type]}</span>
          <div style={{flex: 1}}>
            <div style={{fontWeight: 500}}>{e.label}</div>
            <div className="small muted">{e.account}</div>
          </div>
          <div className={`num ${e.amount >= 0 ? 'pos' : ''}`} style={{fontFamily: 'var(--display)', fontSize: 17}}>{eur(e.amount, {sign: true})}</div>
        </div>
      ))}
    </div>
  );
}

// === CALENDAR ===
function CalendarPage() {
  const [sel, setSel] = uS(MOCK.today.getDate());
  const today = MOCK.today;
  const year = today.getFullYear(), month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // Monday-first
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const events = MOCK.calendar_events;
  const eventsByDay = {};
  for (const e of events) {
    (eventsByDay[e.date] = eventsByDay[e.date] || []).push(e);
  }
  const days = [];
  for (let i = 0; i < startWeekDay; i++) days.push(null);
  for (let d = 1; d <= lastDay; d++) days.push(d);

  const selectedEvents = eventsByDay[sel] || [];
  const labelByType = { income: 'Revenu', charge: 'Charge', saving: 'Épargne', purchase: 'Achat' };
  const colorByType = { income: 'sage', charge: 'rose', saving: 'plum', purchase: 'amber' };
  const monthName = today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const totalIn = events.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = events.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Calendrier</p>
          <h1 className="page-title">{monthName}</h1>
          <p className="page-sub"><span className="pos">↗ {eur(totalIn)} entrants</span> · <span className="neg">↘ {eur(Math.abs(totalOut))} sortants</span> · {events.length} événements</p>
        </div>
        <div className="row gap-2">
          <button className="btn icon"><I.chevL size={14}/></button>
          <button className="btn">Aujourd'hui</button>
          <button className="btn icon"><I.chevR size={14}/></button>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns: '2fr 1fr'}}>
        <div className="card">
          <div className="cal-grid mb-2">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d} className="cal-head">{d}</div>)}
          </div>
          <div className="cal-grid">
            {days.map((d, i) => {
              if (d === null) return <div key={i}/>;
              const ev = eventsByDay[d] || [];
              const isToday = d === today.getDate();
              const isSel = d === sel;
              const types = [...new Set(ev.map(e => e.type))];
              return (
                <button key={i} className={`cal-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}`} onClick={() => setSel(d)}>
                  <span className="d">{d}</span>
                  <div className="dots">
                    {types.map(t => <span key={t} className={`dot ${t}`}/>)}
                    {ev.length > 0 && <span className="tiny" style={{marginLeft: 2, opacity: .7}}>{ev.length}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="row wrap gap-3 mt-4 small muted" style={{justifyContent: 'center'}}>
            <span className="row gap-2"><span className="dot income"/> Revenu</span>
            <span className="row gap-2"><span className="dot charge"/> Charge</span>
            <span className="row gap-2"><span className="dot saving"/> Épargne</span>
            <span className="row gap-2"><span className="dot purchase"/> Achat</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{sel} {today.toLocaleDateString('fr-FR', {month: 'long'})}</div>
              <div className="card-sub">{selectedEvents.length} événement{selectedEvents.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          {selectedEvents.length === 0 && <div className="muted small" style={{padding: '24px 0', textAlign: 'center'}}>Rien de prévu ce jour-là.</div>}
          {selectedEvents.map((e, i) => (
            <div key={i} style={{padding: '12px 0', borderBottom: '1px solid var(--line)'}}>
              <div className="row between">
                <span className={`pill ${colorByType[e.type]}`}>{labelByType[e.type]}</span>
                <span className={`num ${e.amount >= 0 ? 'pos' : ''}`} style={{fontFamily: 'var(--display)', fontSize: 18}}>{eur(e.amount, {sign: true})}</span>
              </div>
              <div style={{fontWeight: 500, marginTop: 4}}>{e.label}</div>
              <div className="small muted">{e.account}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// === YEARLY ===
function YearlyPage() {
  const [metric, setMetric] = uS('net');
  const data = MOCK.yearly;
  const metrics = [
    { id: 'net', label: 'Solde net', accessor: d => d.net, color: 'var(--terra)' },
    { id: 'incomes', label: 'Revenus', accessor: d => d.incomes, color: 'var(--sage)' },
    { id: 'charges', label: 'Charges', accessor: d => d.charges, color: 'var(--rose)' },
    { id: 'savings', label: 'Épargne', accessor: d => d.savings, color: 'var(--plum)' },
    { id: 'purchases', label: 'Achats', accessor: d => d.purchases, color: 'var(--amber)' },
  ];
  const m = metrics.find(x => x.id === metric);
  const values = data.map(m.accessor);
  const min = Math.min(...values), max = Math.max(...values);
  const totalIn = data.reduce((s, d) => s + d.incomes, 0);
  const totalOut = data.reduce((s, d) => s + d.charges + d.purchases, 0);
  const totalSaved = data.reduce((s, d) => s + d.savings, 0);
  const totalNet = data.reduce((s, d) => s + d.net, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Vue annuelle · 2026</p>
          <h1 className="page-title">Une année en un coup d'œil.</h1>
          <p className="page-sub">{eur(totalNet)} épargnés en net sur 12 mois — c'est ton meilleur résultat depuis l'ouverture du compte.</p>
        </div>
        <div className="row gap-2 hide-mobile">
          <button className="btn"><I.chevL size={14}/> 2025</button>
          <button className="btn primary">2026</button>
          <button className="btn">2027 <I.chevR size={14}/></button>
        </div>
      </div>

      <div className="grid mb-4" style={{gridTemplateColumns: 'repeat(4, 1fr)'}}>
        <div className="kpi"><div className="kpi-label">Revenus</div><div className="kpi-value display">{eurShort(totalIn)}</div></div>
        <div className="kpi"><div className="kpi-label">Charges</div><div className="kpi-value display">{eurShort(data.reduce((s,d)=>s+d.charges,0))}</div></div>
        <div className="kpi"><div className="kpi-label">Épargne</div><div className="kpi-value display">{eurShort(totalSaved)}</div></div>
        <div className="kpi tinted"><div className="kpi-label">Solde net</div><div className="kpi-value display">{eurShort(totalNet)}</div></div>
      </div>

      <div className="card mb-6">
        <div className="card-head">
          <div className="card-title">Heatmap mensuelle</div>
          <div className="row gap-2">
            {metrics.map(x => (
              <button key={x.id} className={`btn sm ${metric === x.id ? 'primary' : ''}`} onClick={() => setMetric(x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
        <div className="heat">
          {data.map((d, i) => {
            const v = m.accessor(d);
            const intensity = (v - min) / (max - min || 1);
            return (
              <div key={i} className="heat-cell" style={{background: `color-mix(in oklch, ${m.color} ${10 + intensity * 65}%, var(--bg-sunken))`}}>
                <span className="m">{d.m}</span>
                <span className="v" style={{color: intensity > 0.5 ? 'white' : 'var(--ink)'}}>{eurShort(v)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Évolution sur 12 mois</div>
          <div className="row gap-3 small muted">
            <span className="row gap-2"><span className="dot" style={{background: 'var(--sage)'}}/>Revenus</span>
            <span className="row gap-2"><span className="dot" style={{background: 'var(--rose)'}}/>Charges</span>
            <span className="row gap-2"><span className="dot" style={{background: 'var(--plum)'}}/>Épargne</span>
          </div>
        </div>
        <YearChart data={data}/>
      </div>
    </>
  );
}

function YearChart({ data }) {
  const w = 800, h = 240, pad = 30;
  const maxV = Math.max(...data.flatMap(d => [d.incomes, d.charges, d.savings + d.purchases]));
  const bw = (w - 2*pad) / 12 - 8;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width: '100%', height: 'auto'}}>
      {[0, 0.5, 1].map(p => (
        <line key={p} x1={pad} x2={w-pad} y1={pad + p*(h-2*pad-20)} y2={pad + p*(h-2*pad-20)} stroke="var(--line)" strokeDasharray="2 4"/>
      ))}
      {data.map((d, i) => {
        const x0 = pad + i * ((w - 2*pad) / 12) + 4;
        const innerW = bw / 3;
        const hi = (d.incomes / maxV) * (h - 2*pad - 20);
        const hc = (d.charges / maxV) * (h - 2*pad - 20);
        const hs = (d.savings / maxV) * (h - 2*pad - 20);
        return (
          <g key={i}>
            <rect x={x0} y={h - pad - 20 - hi} width={innerW} height={hi} fill="var(--sage)" rx="2"/>
            <rect x={x0 + innerW + 1} y={h - pad - 20 - hc} width={innerW} height={hc} fill="var(--rose)" rx="2"/>
            <rect x={x0 + 2*innerW + 2} y={h - pad - 20 - hs} width={innerW} height={hs} fill="var(--plum)" rx="2"/>
            <text x={x0 + bw/2} y={h - 6} fontSize="11" fill="var(--ink-3)" textAnchor="middle">{d.m}</text>
          </g>
        );
      })}
    </svg>
  );
}

// === SIMULATOR ===
function SimulatorPage() {
  const [amount, setAmount] = uS(120);
  const [accountId, setAccountId] = uS('');
  const [installments, setInstallments] = uS(1);

  const m = MOCK.monthly;
  const monthlyImpact = amount / installments;
  const availableAfter = m.available_for_purchases - monthlyImpact;
  const finalAfter = m.final_balance - monthlyImpact;
  const ok = availableAfter >= 0;
  const tight = availableAfter >= 0 && availableAfter < 200;

  const verdict = !ok ? 'no' : tight ? 'warn' : 'yes';
  const stamp = !ok ? 'Non.' : tight ? 'Oui, mais…' : 'Oui.';
  const msg = !ok
    ? <>Cet achat ferait passer ta marge à <span className="num">{eur(availableAfter)}</span>. Mieux vaut attendre la prochaine paie le 27.</>
    : tight
    ? <>Ça passe, mais ta marge tomberait à <span className="num">{eur(availableAfter)}</span> — fais attention aux extras d'ici fin mai.</>
    : <>Tranquille. Il te resterait <span className="num">{eur(availableAfter)}</span> de marge après cet achat.</>;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Simulateur</p>
          <h1 className="page-title">Puis-je acheter ça ?</h1>
          <p className="page-sub">Test instantané sur ta marge réelle, après charges, épargne et achats prévus.</p>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns: '1fr 1fr'}}>
        <div className="card">
          <label className="field-label">Montant de l'achat</label>
          <div style={{position: 'relative'}}>
            <input className="input big num" type="number" value={amount} onChange={e => setAmount(Math.max(0, +e.target.value))}/>
            <span style={{position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--display)', fontSize: 32, color: 'var(--ink-3)'}}>€</span>
          </div>
          <div className="grid mt-4" style={{gridTemplateColumns: '1fr 1fr'}}>
            <div className="field">
              <label className="field-label">Compte</label>
              <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Vue globale</option>
                {MOCK.accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {a.bank}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Étalement</label>
              <select className="select" value={installments} onChange={e => setInstallments(+e.target.value)}>
                <option value={1}>Comptant</option>
                <option value={2}>2× sans frais</option>
                <option value={3}>3× sans frais</option>
                <option value={4}>4× sans frais</option>
                <option value={10}>10× (crédit)</option>
              </select>
            </div>
          </div>
          <div className="row gap-2 mt-2 wrap">
            {[50, 100, 250, 500, 1000].map(v => (
              <button key={v} className="btn sm" onClick={() => setAmount(v)}>{v}€</button>
            ))}
          </div>
        </div>

        <div className={`sim-verdict ${verdict}`}>
          <div className="sim-stamp">{stamp}</div>
          <div className="sim-msg">{msg}</div>
        </div>
      </div>

      <div className="grid mt-6" style={{gridTemplateColumns: 'repeat(4, 1fr)'}}>
        <div className="kpi"><div className="kpi-label">Marge avant</div><div className="kpi-value display">{eur(m.available_for_purchases)}</div></div>
        <div className="kpi"><div className="kpi-label">Impact mensuel</div><div className="kpi-value display neg">−{eur(monthlyImpact)}</div></div>
        <div className="kpi" style={{borderColor: ok ? 'var(--sage)' : 'var(--rose)'}}><div className="kpi-label">Marge après</div><div className={`kpi-value display ${ok ? 'pos' : 'neg'}`}>{eur(availableAfter)}</div></div>
        <div className="kpi"><div className="kpi-label">Solde fin de mois</div><div className="kpi-value display">{eur(finalAfter)}</div></div>
      </div>

      <div className="card mt-6">
        <div className="card-head"><div className="card-title">Détail du calcul</div></div>
        <table className="t">
          <tbody>
            <tr><td>Revenus du mois</td><td className="r num pos">+{eur(m.incomes)}</td></tr>
            <tr><td>Charges (perso + ma part coloc)</td><td className="r num neg">−{eur(m.charges_perso + m.charges_coloc)}</td></tr>
            <tr><td>Épargne programmée</td><td className="r num neg">−{eur(m.savings)}</td></tr>
            <tr><td>Achats déjà imputés ({MOCK.purchases.length})</td><td className="r num neg">−{eur(m.purchases_imputed)}</td></tr>
            <tr style={{background: 'var(--bg-sunken)'}}><td><strong>Marge actuelle</strong></td><td className="r num"><strong>{eur(m.available_for_purchases)}</strong></td></tr>
            <tr><td>Cet achat ({installments}× {eur(monthlyImpact)})</td><td className="r num neg">−{eur(monthlyImpact)}</td></tr>
            <tr style={{background: ok ? 'var(--sage-bg)' : 'var(--rose-bg)'}}>
              <td><strong>Marge restante</strong></td>
              <td className={`r num ${ok ? 'pos' : 'neg'}`}><strong>{eur(availableAfter)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// === COLOC ===
function ColocPage() {
  const c = MOCK.coloc;
  const total = c.by_user.reduce((s, u) => s + u.total_due, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Coloc · Pixel St-Marc · Mai 2026</p>
          <h1 className="page-title">Qui doit quoi à qui.</h1>
          <p className="page-sub">{eur(total)} de charges partagées ce mois. Les remboursements s'équilibrent en 2 virements.</p>
        </div>
        <button className="btn"><I.download size={14}/> Exporter PDF</button>
      </div>

      {/* Flow visualization */}
      <div className="card mb-6">
        <div className="card-head">
          <div className="card-title">Flux de remboursement</div>
          <div className="card-sub">2 virements suffisent pour solder le mois</div>
        </div>
        <FlowViz debts={c.debts} users={c.users}/>
      </div>

      {/* Per-coloc cards */}
      <div className="grid mb-6" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
        {c.by_user.map(u => {
          const user = c.users.find(x => x.id === u.user_id);
          const balCol = u.balance > 0 ? 'pos' : u.balance < 0 ? 'neg' : '';
          return (
            <div key={u.user_id} className="card">
              <div className="row between mb-3">
                <div className="row gap-2">
                  <div className={`avatar ${user.color}`} style={{width: 36, height: 36, fontSize: 14}}>{user.initial}</div>
                  <div>
                    <div style={{fontFamily: 'var(--display)', fontSize: 22}}>{u.name}</div>
                    <div className="small muted">{u.user_id === MOCK.me.id ? 'C\'est toi' : 'Coloc'}</div>
                  </div>
                </div>
                <span className={`pill ${u.balance > 0 ? 'sage' : 'rose'}`}>{u.balance > 0 ? 'Créditeur' : 'Débiteur'}</span>
              </div>
              <div className="grid" style={{gridTemplateColumns: '1fr 1fr', gap: 10}}>
                <div>
                  <div className="eyebrow">Dû</div>
                  <div className="num" style={{fontFamily: 'var(--display)', fontSize: 22}}>{eur(u.total_due)}</div>
                </div>
                <div>
                  <div className="eyebrow">Payé</div>
                  <div className="num" style={{fontFamily: 'var(--display)', fontSize: 22}}>{eur(u.paid)}</div>
                </div>
              </div>
              <div className="divider mt-3 mb-3"/>
              <div className="row between">
                <span className="small muted">Solde</span>
                <span className={`num ${balCol}`} style={{fontFamily: 'var(--display)', fontSize: 26}}>{eur(u.balance, {sign: true})}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charges detail */}
      <div className="card">
        <div className="card-head"><div className="card-title">Charges partagées du mois</div></div>
        <table className="t">
          <thead>
            <tr>
              <th>Charge</th>
              <th>Payée par</th>
              <th>Mode</th>
              <th className="r">Total</th>
              <th className="r">Par personne</th>
            </tr>
          </thead>
          <tbody>
            {MOCK.charges.filter(c => c.shared).map(c => {
              const payer = MOCK.users.find(u => u.id === c.payer_id);
              return (
                <tr key={c.id}>
                  <td><strong>{c.label}</strong></td>
                  <td>
                    <span className="row gap-2">
                      <div className={`avatar ${payer.color}`} style={{width: 20, height: 20, fontSize: 10}}>{payer.initial}</div>
                      {payer.name}
                    </span>
                  </td>
                  <td><span className="pill">{c.split}</span></td>
                  <td className="r num">{eur(c.total)}</td>
                  <td className="r num">{eur(c.my_share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FlowViz({ debts, users }) {
  const userById = id => users.find(u => u.id === id);
  return (
    <div style={{padding: '24px 0'}}>
      {debts.map((d, i) => {
        const from = userById(d.from), to = userById(d.to);
        return (
          <div key={i} className="flow">
            <div className="row gap-3" style={{minWidth: 140}}>
              <div className={`avatar ${from.color}`} style={{width: 44, height: 44, fontSize: 18}}>{from.initial}</div>
              <div>
                <div style={{fontFamily: 'var(--display)', fontSize: 20}}>{from.name}</div>
                <div className="small muted">doit</div>
              </div>
            </div>
            <div className="flow-arrow" style={{position: 'relative'}}>
              <span className="flow-amount num">{eur(d.amount)}</span>
            </div>
            <div className="row gap-3" style={{minWidth: 140, justifyContent: 'flex-end'}}>
              <div style={{textAlign: 'right'}}>
                <div style={{fontFamily: 'var(--display)', fontSize: 20}}>{to.name}</div>
                <div className="small muted">reçoit</div>
              </div>
              <div className={`avatar ${to.color}`} style={{width: 44, height: 44, fontSize: 18}}>{to.initial}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// === SHOPPING ===
function ShoppingPage() {
  const [items, setItems] = uS(MOCK.shopping);
  const [filter, setFilter] = uS('all');
  const visible = filter === 'all' ? items : items.filter(i => filter === 'todo' ? !i.bought : i.bought);
  const todo = items.filter(i => !i.bought).length;
  const estTotal = items.filter(i => !i.bought).reduce((s, i) => s + (i.est || 0), 0);
  const colorByPrio = { urgent: 'rose', high: 'amber', normal: '', low: '' };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Courses · Pixel St-Marc</p>
          <h1 className="page-title">Liste partagée</h1>
          <p className="page-sub">{todo} article{todo > 1 ? 's' : ''} à acheter · estimé {eur(estTotal)}. Camille a ajouté 3 articles aujourd'hui.</p>
        </div>
        <div className="row gap-2">
          <div className="row gap-1" style={{background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: 3}}>
            {['all', 'todo', 'done'].map(f => (
              <button key={f} className={`btn sm ghost ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)} style={{borderRadius: 7}}>
                {f === 'all' ? 'Tout' : f === 'todo' ? 'À acheter' : 'Achetés'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-4" style={{padding: 12}}>
        <div className="row gap-2">
          <I.plus size={16}/>
          <input className="input" placeholder="Ajouter un article…" style={{border: 'none', padding: 6}}/>
          <button className="btn primary">Ajouter</button>
        </div>
      </div>

      {['Frigo', 'Sec', 'Maison'].map(cat => {
        const inCat = visible.filter(i => i.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="eyebrow mb-2">{cat} · {inCat.filter(i => !i.bought).length} restants</h3>
            {inCat.map(item => {
              const addedBy = MOCK.users.find(u => u.name === item.added_by);
              return (
                <div key={item.id} className={`shop-item ${item.bought ? 'done' : ''}`}>
                  <button className={`checkbox ${item.bought ? 'checked' : ''}`} onClick={() => setItems(items.map(x => x.id === item.id ? {...x, bought: !x.bought, bought_by: MOCK.me.name} : x))}>
                    {item.bought && <I.check size={14}/>}
                  </button>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div className="shop-label">{item.label} <span className="shop-meta">· {item.qty}</span></div>
                    <div className="shop-meta">
                      Ajouté par {item.added_by}
                      {item.bought && item.bought_by && <> · acheté par <strong>{item.bought_by}</strong></>}
                    </div>
                  </div>
                  {item.priority !== 'normal' && item.priority !== 'low' && !item.bought && (
                    <span className={`pill ${colorByPrio[item.priority]}`}>{item.priority === 'urgent' ? 'Urgent' : 'Important'}</span>
                  )}
                  <div className="num right small">{item.est ? eur(item.est) : ''}</div>
                  <div className={`avatar ${addedBy?.color || 'terra'}`} style={{width: 24, height: 24, fontSize: 11}}>{addedBy?.initial || '?'}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// === ACCOUNTS ===
function AccountsPage({ space = 'perso' }) {
  const accounts = MOCK.accounts.filter(a => (a.space || 'perso') === space);
  const total = accounts.reduce((s, a) => s + a.initial_balance, 0);
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Comptes · {space === 'pro' ? 'Pro' : 'Perso'}</p>
          <h1 className="page-title">{eur(total)}</h1>
          <p className="page-sub">Réparti sur {accounts.length} compte{accounts.length>1?'s':''}. Les comptes joints sont liés à plusieurs utilisateurs.</p>
        </div>
        <button className="btn primary"><I.plus size={14}/> Ajouter un compte</button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon="wallet" title={`Aucun compte ${space}`}
          body={`Ajoute ton premier compte ${space === 'pro' ? 'professionnel (Qonto, Shine, etc.)' : 'personnel ou joint'} pour commencer.`}
          action="Ajouter un compte"/>
      ) : (
      <div className="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
        {accounts.map(a => {
          const members = a.members || [MOCK.me.id];
          const joint = members.length > 1;
          return (
          <div key={a.id} className="card account-card">
            <div className="row between mb-3">
              <span className="pill">{a.type}</span>
              <span className="small muted">{a.bank}</span>
            </div>
            <div style={{fontFamily: 'var(--display)', fontSize: 32}}>{eur(a.initial_balance)}</div>
            <div className="small muted mt-1">{a.name}</div>
            <Sparkline data={[a.initial_balance*0.92, a.initial_balance*0.95, a.initial_balance*0.97, a.initial_balance, a.initial_balance*1.03, a.initial_balance*1.04]} color={`var(--${a.color === 'ink' ? 'terra' : a.color})`} width={240} height={48} fill/>
            <div className="row between mt-2" style={{borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 12}}>
              <div className="small muted">{joint ? `${members.length} co-titulaires` : 'Titulaire unique'}</div>
              <AvatarStack ids={members} size={22}/>
            </div>
          </div>
        )})}
      </div>
      )}

      <div className="card mt-4" style={{background: 'var(--accent-bg)', border: '1px dashed var(--line-strong)'}}>
        <div className="row between" style={{alignItems:'flex-start', gap: 16, flexWrap:'wrap'}}>
          <div>
            <p className="eyebrow">À venir</p>
            <h3 style={{fontFamily:'var(--display)', fontSize: 24, margin:'4px 0 6px'}}>Comptes joints multi-utilisateurs</h3>
            <p className="muted" style={{maxWidth: 520, margin: 0}}>Chaque compte joint sera directement lié aux profils de ses titulaires. Les charges payées s'affecteront automatiquement à chaque coloc, et les soldes seront synchronisés en temps réel.</p>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap: 8, minWidth: 200}}>
            <div className="small muted">Utilisateurs liés au compte joint</div>
            {MOCK.users.map(u => (
              <div key={u.id} className="row" style={{gap: 8, alignItems:'center'}}>
                <div className={`avatar ${u.color}`} style={{width: 22, height: 22, fontSize: 11}}>{u.initial}</div>
                <span style={{fontSize: 14}}>{u.name}</span>
                <span className="pill" style={{marginLeft: 'auto', fontSize: 11}}>Actif</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// === SIMPLE CRUD-ISH PAGES ===
function makeCrudPage({ title, eyebrow, sub, items, columns, addLabel }) {
  return () => (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{sub}</p>
        </div>
        <button className="btn primary"><I.plus size={14}/> {addLabel}</button>
      </div>
      <div className="card">
        <table className="t">
          <thead><tr>{columns.map(c => <th key={c.key} className={c.r ? 'r' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i}>{columns.map(c => (
                <td key={c.key} className={c.r ? 'r' : ''}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const IncomesPage = makeCrudPage({
  title: 'Revenus', eyebrow: 'Revenus', addLabel: 'Nouveau revenu',
  sub: `${eur(MOCK.monthly.incomes)} prévus ce mois — 2 sources actives.`,
  items: MOCK.incomes,
  columns: [
    { key: 'source', label: 'Source', render: r => <strong>{r.source}</strong> },
    { key: 'type', label: 'Type', render: r => <span className="pill">{r.type}</span> },
    { key: 'day', label: 'Jour', render: r => `Le ${r.day}` },
    { key: 'account_id', label: 'Compte', render: r => MOCK.accounts.find(a => a.id === r.account_id)?.name },
    { key: 'amount', label: 'Montant', r: true, render: r => <span className="num pos display" style={{fontSize: 18}}>+{eur(r.amount)}</span> },
  ],
});

const ChargesPage = makeCrudPage({
  title: 'Charges', eyebrow: 'Charges', addLabel: 'Nouvelle charge',
  sub: `${eur(MOCK.monthly.charges_perso + MOCK.monthly.charges_coloc)} de charges ce mois (perso + ma part coloc).`,
  items: MOCK.charges,
  columns: [
    { key: 'label', label: 'Charge', render: r => <strong>{r.label}</strong> },
    { key: 'shared', label: 'Partage', render: r => <span className={`pill ${r.shared ? 'sage' : ''}`}>{r.shared ? 'Coloc' : 'Perso'}</span> },
    { key: 'split', label: 'Mode' },
    { key: 'day', label: 'Jour', render: r => `Le ${r.day}` },
    { key: 'total', label: 'Total', r: true, render: r => <span className="num">{eur(r.total)}</span> },
    { key: 'my_share', label: 'Ma part', r: true, render: r => <span className="num neg display" style={{fontSize: 17}}>−{eur(r.my_share)}</span> },
  ],
});

const TransfersPage = makeCrudPage({
  title: 'Virements', eyebrow: 'Virements interbancaires', addLabel: 'Nouveau virement',
  sub: 'Mouvements entre tes comptes. L\'épargne automatique apparaît dans Épargne.',
  items: MOCK.savings.map(s => ({ ...s, kind: 'Récurrent' })),
  columns: [
    { key: 'label', label: 'Libellé', render: r => <strong>{r.label}</strong> },
    { key: 'kind', label: 'Type', render: r => <span className="pill plum">{r.kind}</span> },
    { key: 'flow', label: 'Flux', render: r => `${MOCK.accounts.find(a => a.id === r.source_account_id)?.name} → ${MOCK.accounts.find(a => a.id === r.dest_account_id)?.name}` },
    { key: 'day', label: 'Jour', render: r => `Le ${r.day}` },
    { key: 'amount', label: 'Montant', r: true, render: r => <span className="num">{eur(r.amount)}</span> },
  ],
});

const SavingsPage = makeCrudPage({
  title: 'Épargne automatique', eyebrow: 'Épargne', addLabel: 'Nouvelle règle',
  sub: `${eur(MOCK.monthly.savings)} mis de côté chaque mois automatiquement.`,
  items: MOCK.savings,
  columns: [
    { key: 'label', label: 'Règle', render: r => <strong>{r.label}</strong> },
    { key: 'flow', label: 'Flux', render: r => `${MOCK.accounts.find(a => a.id === r.source_account_id)?.name} → ${MOCK.accounts.find(a => a.id === r.dest_account_id)?.name}` },
    { key: 'day', label: 'Jour', render: r => `Le ${r.day}` },
    { key: 'amount', label: 'Montant', r: true, render: r => <span className="num plum display" style={{fontSize: 18, color: 'var(--plum)'}}>{eur(r.amount)}</span> },
  ],
});

const PurchasesPage = makeCrudPage({
  title: 'Achats', eyebrow: 'Achats & étalements', addLabel: 'Nouvel achat',
  sub: 'Achats comptant ou en plusieurs fois — répartis automatiquement sur les mois.',
  items: MOCK.purchases,
  columns: [
    { key: 'date', label: 'Date' },
    { key: 'desc', label: 'Achat', render: r => <strong>{r.desc}</strong> },
    { key: 'category', label: 'Catégorie', render: r => <span className="pill">{r.category}</span> },
    { key: 'installments', label: 'Étalement', render: r => r.installments === 1 ? 'Comptant' : `${r.installments}× ${eur(r.monthly)}` },
    { key: 'total', label: 'Total', r: true, render: r => <span className="num">{eur(r.total)}</span> },
    { key: 'monthly', label: 'Ce mois', r: true, render: r => <span className="num neg display" style={{fontSize: 17}}>−{eur(r.monthly)}</span> },
  ],
});

Object.assign(window, {
  Dashboard, CalendarPage, YearlyPage, SimulatorPage, ColocPage, ShoppingPage,
  AccountsPage, IncomesPage, ChargesPage, TransfersPage, SavingsPage, PurchasesPage,
  ComptaProPage,
});

// === COMPTABILITÉ PRO ===
function ComptaProPage() {
  const p = MOCK.pro;
  const provisionEur = p.ca_month * (p.urssaf_provision / 100);
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Comptabilité pro · Mai 2026</p>
          <h1 className="page-title">{eur(p.ca_month)}</h1>
          <p className="page-sub">Chiffre d'affaires du mois · {eur(p.ca_ytd)} depuis janvier.</p>
        </div>
        <button className="btn"><I.download size={14}/> Export comptable</button>
      </div>

      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24}}>
        <div className="card">
          <p className="eyebrow">CA encaissé</p>
          <div className="num display" style={{fontSize: 36}}>{eur(p.ca_month)}</div>
          <Sparkline data={[2800, 3400, 2900, 4100, 3700, 4200]} color="var(--accent)" width={220} height={40} fill/>
        </div>
        <div className="card">
          <p className="eyebrow">Provision URSSAF ({p.urssaf_provision}%)</p>
          <div className="num display neg" style={{fontSize: 36}}>−{eur(provisionEur)}</div>
          <div className="small muted mt-1">Mis de côté automatiquement sur compte Provision.</div>
        </div>
        <div className="card">
          <p className="eyebrow">Régime TVA</p>
          <div className="display" style={{fontSize: 28, fontWeight: 500}}>{p.tva_status}</div>
          <div className="small muted mt-1">Seuil : 36 800 € — il te reste 8 400 €.</div>
        </div>
        <div className="card" style={{background:'var(--accent-bg)'}}>
          <p className="eyebrow">Net disponible</p>
          <div className="num display pos" style={{fontSize: 36}}>{eur(p.ca_month - provisionEur - p.charges_month - p.accountant.monthly)}</div>
          <div className="small muted mt-1">CA − URSSAF − charges − cabinet.</div>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns:'1.4fr 1fr', gap: 16}}>
        <div className="card">
          <h3 style={{fontFamily:'var(--display)', fontSize: 22, margin:'0 0 16px'}}>Factures du mois</h3>
          <table className="t">
            <thead><tr><th>Client</th><th>Date</th><th>Statut</th><th className="r">Montant</th></tr></thead>
            <tbody>
              {p.invoices.map(inv => (
                <tr key={inv.id}>
                  <td><strong>{inv.client}</strong></td>
                  <td className="muted">{inv.date}</td>
                  <td><span className={`pill ${inv.status==='payée'?'sage':'amber'}`}>{inv.status}</span></td>
                  <td className="r num">{eur(inv.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <p className="eyebrow">Cabinet comptable</p>
          <h3 style={{fontFamily:'var(--display)', fontSize: 24, margin:'4px 0 12px'}}>{p.accountant.name}</h3>
          <div className="num display" style={{fontSize: 32}}>{eur(p.accountant.monthly)}<span className="small muted" style={{marginLeft: 6}}>/ mois</span></div>
          <div className="small muted mt-1">Soit {eur(p.accountant.monthly*12)} sur l'année.</div>
          <ul style={{margin:'16px 0 0', padding: 0, listStyle:'none', display:'flex', flexDirection:'column', gap: 8}}>
            {p.accountant.included.map(item => (
              <li key={item} style={{display:'flex', gap: 8, alignItems:'center', fontSize: 14}}>
                <I.check size={14} /> {item}
              </li>
            ))}
          </ul>
          <button className="btn mt-3" style={{width:'100%'}}>Comparer d'autres cabinets</button>
        </div>
      </div>
    </>
  );
}
