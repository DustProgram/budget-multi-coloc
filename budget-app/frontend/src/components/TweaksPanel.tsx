import { useEffect, useState } from 'react';
import { Sliders, X } from 'lucide-react';

type Theme = 'doux' | 'night' | 'sobre';
type Font = 'serif' | 'sans';
type Accent = 'terra' | 'sage' | 'plum' | 'amber';
type AnimLevel = 'none' | 'subtle' | 'rich';

interface Tweaks {
  theme: Theme;
  font: Font;
  accent: Accent;
  animations: AnimLevel;
}

const DEFAULTS: Tweaks = {
  theme: 'doux',
  font: 'serif',
  accent: 'terra',
  animations: 'subtle',
};
const STORAGE_KEY = 'budget-tweaks';

const FONT_DISPLAY: Record<Font, string> = {
  serif: "'Instrument Serif', 'EB Garamond', Georgia, serif",
  sans: "'Geist', 'Inter Tight', -apple-system, system-ui, sans-serif",
};

const ACCENT_COLORS: Record<Accent, { accent: string; bg: string }> = {
  terra: { accent: 'oklch(0.62 0.12 40)',  bg: 'oklch(0.94 0.04 50)' },
  sage:  { accent: 'oklch(0.62 0.08 150)', bg: 'oklch(0.94 0.03 150)' },
  plum:  { accent: 'oklch(0.55 0.09 320)', bg: 'oklch(0.94 0.03 320)' },
  amber: { accent: 'oklch(0.78 0.12 80)',  bg: 'oklch(0.94 0.04 80)' },
};

function load(): Tweaks {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // Migration : ancienne valeur booléenne → AnimLevel
    if (typeof parsed.animations === 'boolean') {
      parsed.animations = parsed.animations ? 'subtle' : 'none';
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function apply(t: Tweaks) {
  const root = document.documentElement;
  if (t.theme === 'doux') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t.theme);
  root.setAttribute('data-anim', t.animations);
  root.style.setProperty('--display', FONT_DISPLAY[t.font]);
  const c = ACCENT_COLORS[t.accent];
  root.style.setProperty('--accent', c.accent);
  if (t.theme === 'doux') {
    root.style.setProperty('--accent-bg', c.bg);
  } else {
    root.style.removeProperty('--accent-bg');
  }
}

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const [tweaks, setTweaks] = useState<Tweaks>(load);

  useEffect(() => {
    apply(tweaks);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks)); } catch {}
  }, [tweaks]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Réglages d'affichage"
        aria-label="Ouvrir les réglages d'affichage"
        style={{
          position: 'fixed', bottom: 20, right: 20,
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          color: 'var(--ink-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: 'var(--shadow)', zIndex: 5,
        }}
      >
        <Sliders size={18} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 100%)', height: '100vh',
              background: 'var(--bg-elev)', borderLeft: '1px solid var(--line)',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22,
              overflowY: 'auto',
            }}
          >
            <div className="row between">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Affichage</p>
                <h2 style={{ fontFamily: 'var(--display)', fontSize: 28, margin: '4px 0 0' }}>Réglages</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--ink-3)',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Thème</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {(['doux', 'night', 'sobre'] as Theme[]).map((t) => (
                  <Tile
                    key={t}
                    selected={tweaks.theme === t}
                    onClick={() => setTweaks({ ...tweaks, theme: t })}
                    label={t === 'doux' ? 'Doux' : t === 'night' ? 'Nuit' : 'Sobre'}
                  >
                    <ThemePreview theme={t} />
                  </Tile>
                ))}
              </div>
            </section>

            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Police d'affichage</div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['serif', 'sans'] as Font[]).map((f) => (
                  <Tile
                    key={f}
                    selected={tweaks.font === f}
                    onClick={() => setTweaks({ ...tweaks, font: f })}
                    label={f === 'serif' ? 'Instrument Serif' : 'Geist'}
                  >
                    <span style={{
                      fontFamily: FONT_DISPLAY[f], fontSize: 32, lineHeight: 1,
                      letterSpacing: '-0.02em', color: 'var(--ink)',
                    }}>
                      Aa
                    </span>
                  </Tile>
                ))}
              </div>
            </section>

            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Couleur d'accent</div>
              <div className="row gap-2">
                {(['terra', 'sage', 'plum', 'amber'] as Accent[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setTweaks({ ...tweaks, accent: a })}
                    title={a}
                    aria-label={`Accent ${a}`}
                    style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: ACCENT_COLORS[a].accent,
                      border: tweaks.accent === a ? '3px solid var(--ink)' : '3px solid var(--bg-elev)',
                      cursor: 'pointer', outline: 'none',
                      boxShadow: tweaks.accent === a ? '0 0 0 2px var(--bg-elev)' : 'none',
                      transition: 'border .15s ease',
                    }}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Animations</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {([
                  { id: 'none' as const, label: 'Aucune', desc: 'Statique' },
                  { id: 'subtle' as const, label: 'Légères', desc: 'Hovers, fades' },
                  { id: 'rich' as const, label: 'Riches', desc: 'Tout transitionne' },
                ]).map((opt) => (
                  <Tile
                    key={opt.id}
                    selected={tweaks.animations === opt.id}
                    onClick={() => setTweaks({ ...tweaks, animations: opt.id })}
                    label={opt.label}
                  >
                    <span className="small muted" style={{ fontSize: 11 }}>{opt.desc}</span>
                  </Tile>
                ))}
              </div>
            </section>

            <div className="small muted" style={{ marginTop: 'auto' }}>
              Tes préférences sont stockées localement (localStorage).
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({
  selected, onClick, label, children,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 8px',
        borderRadius: 12,
        border: selected ? '2px solid var(--ink)' : '1px solid var(--line)',
        background: selected ? 'var(--bg-sunken)' : 'var(--bg-elev)',
        cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
        color: 'var(--ink)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}
    >
      {children}
      <span style={{ fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  const colors: Record<Theme, { bg: string; ink: string; accent: string }> = {
    doux: { bg: '#faf7f2', ink: '#1c1917', accent: '#c97155' },
    night: { bg: '#14130f', ink: '#f5f1e8', accent: '#c97155' },
    sobre: { bg: '#ffffff', ink: '#0a0a0a', accent: '#a3a3a3' },
  };
  const c = colors[theme];
  return (
    <div style={{
      width: 56, height: 36, borderRadius: 7,
      background: c.bg, border: '1px solid var(--line)',
      position: 'relative', overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute', top: 4, left: 4, right: 4, height: 4,
        background: c.ink, borderRadius: 2,
      }} />
      <span style={{
        position: 'absolute', bottom: 4, left: 4, width: 18, height: 6,
        background: c.accent, borderRadius: 2,
      }} />
    </div>
  );
}
