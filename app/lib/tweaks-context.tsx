'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { TweakValues } from './types';

const DEFAULTS: TweakValues = {
  theme: 'doux',
  accent: 'terra',
  serif_titles: true,
  animations: true,
  space: 'perso',
};

interface TweaksCtx {
  tweaks: TweakValues;
  setTweak: <K extends keyof TweakValues>(key: K, value: TweakValues[K]) => void;
}

const TweaksContext = createContext<TweaksCtx>({
  tweaks: DEFAULTS,
  setTweak: () => {},
});

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaks] = useState<TweakValues>(() => {
    if (typeof window === 'undefined') return DEFAULTS;
    try {
      const saved = localStorage.getItem('compte-gestion-tweaks');
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  const setTweak = useCallback(<K extends keyof TweakValues>(key: K, value: TweakValues[K]) => {
    setTweaks(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('compte-gestion-tweaks', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = tweaks.theme === 'doux' ? '' : tweaks.theme;
    root.dataset.anim = tweaks.animations ? 'on' : 'off';

    const hueMap: Record<string, number> = { terra: 40, sage: 150, plum: 320, ink: 60 };
    const accentMap: Record<string, string> = {
      terra: 'oklch(0.62 0.12 40)',
      sage: 'oklch(0.55 0.08 150)',
      plum: 'oklch(0.55 0.09 320)',
      ink: tweaks.theme === 'night' ? '#f5f1e8' : '#1c1917',
    };
    const hue = hueMap[tweaks.accent] ?? 40;
    const accent = accentMap[tweaks.accent] || accentMap.terra;
    const accentBg = tweaks.theme === 'night'
      ? `oklch(0.28 0.06 ${hue})`
      : tweaks.theme === 'sobre'
      ? `oklch(0.96 0.02 ${hue})`
      : `oklch(0.94 0.04 ${hue})`;

    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-bg', accentBg);
    if (!tweaks.serif_titles) {
      root.style.setProperty('--display', "'Geist', system-ui, sans-serif");
    } else {
      root.style.removeProperty('--display');
    }
  }, [tweaks]);

  return (
    <TweaksContext.Provider value={{ tweaks, setTweak }}>
      {children}
    </TweaksContext.Provider>
  );
}

export const useTweaks = () => useContext(TweaksContext);
