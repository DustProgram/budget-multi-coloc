import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Badge fixe en bas à gauche quand le navigateur est offline.
 *  Le service worker sert le cache, mais on prévient explicitement l'user. */
export function OfflineBadge() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 20, left: 20,
        padding: '8px 14px', borderRadius: 999,
        background: 'var(--rose-bg)', color: 'var(--rose)',
        border: '1px solid var(--rose)',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 13, fontWeight: 500, zIndex: 5,
        boxShadow: 'var(--shadow)',
      }}
    >
      <WifiOff size={14} />
      Hors ligne — affichage depuis le cache
    </div>
  );
}
