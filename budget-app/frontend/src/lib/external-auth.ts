/** Helpers pour l'auth externe (port 8765) — token stocké en localStorage,
 *  ajouté à toutes les requêtes axios via interceptor. */

const TOKEN_KEY = 'budget-external-token';

export function isExternalContext(): boolean {
  // On considère "externe" si l'URL n'inclut pas /api/hassio_ingress/
  // (= on n'est pas servi par l'ingress HA).
  return typeof window !== 'undefined'
    && !window.location.pathname.includes('/api/hassio_ingress/');
}

export function getExternalToken(): string | null {
  if (typeof window === 'undefined') return null;
  // 1) ?token= dans l'URL : on le ramasse et on le stocke
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch {}
    // Nettoie l'URL pour ne pas laisser le token visible dans l'historique
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
    return fromUrl;
  }
  // 2) Sinon depuis localStorage
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setExternalToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearExternalToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
