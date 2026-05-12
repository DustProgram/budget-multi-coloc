import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Space } from '../types';

const STORAGE_KEY = 'budget-active-space';

interface SpaceCtx {
  space: Space;
  setSpace: (s: Space) => void;
}

const Ctx = createContext<SpaceCtx>({ space: 'perso', setSpace: () => {} });

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpaceState] = useState<Space>(() => {
    if (typeof window === 'undefined') return 'perso';
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'pro' ? 'pro' : 'perso';
    } catch {
      return 'perso';
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, space); } catch {}
    document.documentElement.setAttribute('data-space', space);
  }, [space]);

  return (
    <Ctx.Provider value={{ space, setSpace: setSpaceState }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSpace() {
  return useContext(Ctx);
}
