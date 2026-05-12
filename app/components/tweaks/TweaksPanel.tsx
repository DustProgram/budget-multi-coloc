'use client';

import { useState } from 'react';
import { useTweaks } from '@/lib/tweaks-context';
import { Icons } from '@/components/shell/icons';

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const { tweaks, setTweak } = useTweaks();

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Tweaks"
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 100,
          width: 40, height: 40, borderRadius: 12,
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-3)', cursor: 'pointer',
          boxShadow: 'var(--shadow)',
        }}
      >
        <Icons.sliders size={16} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: 16, bottom: 68, zIndex: 99,
          width: 280, maxHeight: 'calc(100vh - 100px)',
          background: 'rgba(250,249,247,.92)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '.5px solid rgba(255,255,255,.6)',
          borderRadius: 14,
          boxShadow: '0 1px 0 rgba(255,255,255,.5) inset, 0 12px 40px rgba(0,0,0,.18)',
          fontSize: 11.5,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px 10px 14px' }}>
            <b style={{ fontSize: 12, fontWeight: 600 }}>Tweaks</b>
            <button onClick={() => setOpen(false)} style={{ appearance: 'none', border: 0, background: 'transparent', color: 'rgba(41,38,27,.55)', width: 22, height: 22, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
          <div style={{ padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            <Section label="Thème" />
            <Segmented
              label="Ambiance"
              value={tweaks.theme}
              options={[
                { value: 'doux', label: 'Doux' },
                { value: 'night', label: 'Nuit' },
                { value: 'sobre', label: 'Sobre' },
              ]}
              onChange={v => setTweak('theme', v as 'doux' | 'night' | 'sobre')}
            />
            <Section label="Accent" />
            <ColorPicker
              label="Couleur"
              value={tweaks.accent}
              options={[
                { value: 'terra', color: '#c97155', label: 'Terracotta' },
                { value: 'sage', color: '#6e8c70', label: 'Sauge' },
                { value: 'plum', color: '#8a6680', label: 'Prune' },
                { value: 'ink', color: '#1c1917', label: 'Encre' },
              ]}
              onChange={v => setTweak('accent', v as 'terra' | 'sage' | 'plum' | 'ink')}
            />
            <Section label="Typographie" />
            <Toggle
              label="Sérif pour les titres"
              value={tweaks.serif_titles}
              onChange={v => setTweak('serif_titles', v)}
            />
            <Section label="Mouvements" />
            <Toggle
              label="Animations de transition"
              value={tweaks.animations}
              onChange={v => setTweak('animations', v)}
            />
            <Section label="Espace" />
            <Segmented
              label="Contexte actif"
              value={tweaks.space}
              options={[
                { value: 'perso', label: 'Perso' },
                { value: 'pro', label: 'Pro' },
              ]}
              onChange={v => setTweak('space', v as 'perso' | 'pro')}
            />
          </div>
        </div>
      )}
    </>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(41,38,27,.45)', paddingTop: 10 }}>
      {label}
    </div>
  );
}

function Segmented({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const idx = options.findIndex(o => o.value === value);
  const n = options.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ color: 'rgba(41,38,27,.72)', fontWeight: 500 }}>{label}</div>
      <div style={{ position: 'relative', display: 'flex', padding: 2, borderRadius: 8, background: 'rgba(0,0,0,.06)', userSelect: 'none' }}>
        <div style={{
          position: 'absolute', top: 2, bottom: 2,
          borderRadius: 6, background: 'rgba(255,255,255,.9)',
          boxShadow: '0 1px 2px rgba(0,0,0,.12)',
          transition: 'left .15s cubic-bezier(.3,.7,.4,1), width .15s',
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
        }} />
        {options.map(o => (
          <button key={o.value} type="button"
            onClick={() => onChange(o.value)}
            style={{
              appearance: 'none', position: 'relative', zIndex: 1, flex: 1,
              border: 0, background: 'transparent', color: 'inherit', fontFamily: 'inherit',
              fontWeight: 500, minHeight: 22, borderRadius: 6, cursor: 'pointer',
              padding: '4px 6px', lineHeight: 1.2, fontSize: 11.5,
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ color: 'rgba(41,38,27,.72)', fontWeight: 500 }}>{label}</div>
      <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)}
        style={{
          position: 'relative', width: 32, height: 18, border: 0, borderRadius: 999,
          background: value ? '#34c759' : 'rgba(0,0,0,.15)',
          transition: 'background .15s', cursor: 'pointer', padding: 0, flexShrink: 0,
        }}>
        <i style={{
          position: 'absolute', top: 2, left: 2, width: 14, height: 14,
          borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          transition: 'transform .15s',
          transform: value ? 'translateX(14px)' : 'none',
          display: 'block',
        }} />
      </button>
    </div>
  );
}

function ColorPicker({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; color: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ color: 'rgba(41,38,27,.72)', fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(o => (
          <button key={o.value} type="button"
            onClick={() => onChange(o.value)}
            title={o.label}
            style={{
              flex: 1, height: 32, border: 0, borderRadius: 8,
              background: o.color, cursor: 'pointer',
              boxShadow: value === o.value
                ? '0 0 0 2px white, 0 0 0 4px ' + o.color
                : '0 0 0 .5px rgba(0,0,0,.12)',
              transition: 'box-shadow .12s',
            }}
          />
        ))}
      </div>
    </div>
  );
}
