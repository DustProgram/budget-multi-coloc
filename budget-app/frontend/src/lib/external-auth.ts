/** Helpers pour l'auth externe (port 8765).
 *  En 0.4+ on utilise un cookie HttpOnly signé côté serveur — donc le
 *  frontend n'a plus rien à stocker. On garde juste un flag "loggé" en
 *  localStorage pour éviter un round-trip au boot. */

const LOGGED_KEY = 'budget-external-logged';

export function isExternalContext(): boolean {
  return typeof window !== 'undefined'
    && !window.location.pathname.includes('/api/hassio_ingress/');
}

export function markLoggedIn(): void {
  try { localStorage.setItem(LOGGED_KEY, '1'); } catch {}
}

export function clearLoggedFlag(): void {
  try { localStorage.removeItem(LOGGED_KEY); } catch {}
}

export function hasLoggedFlag(): boolean {
  try { return localStorage.getItem(LOGGED_KEY) === '1'; } catch { return false; }
}
