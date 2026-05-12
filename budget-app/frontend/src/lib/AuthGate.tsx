import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { isExternalContext, getExternalToken, clearExternalToken } from './external-auth';
import { ExternalLogin } from '../pages/ExternalLogin';

/** Sur le port externe : vérifie qu'un token valide existe avant de monter
 *  l'app. En cas de 401 sur un endpoint protégé, repasse en mode login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const external = isExternalContext();
  const qc = useQueryClient();
  const [showLogin, setShowLogin] = useState(false);

  // Essaye de lire le user actuel ; si OK → app ; si 401 → login.
  const me = useQuery({
    queryKey: ['me-gate'],
    queryFn: async () => (await api.get('/users/me')).data,
    enabled: external,
    retry: false,
  });

  useEffect(() => {
    if (!external) return;
    if (!getExternalToken()) {
      setShowLogin(true);
    }
  }, [external]);

  useEffect(() => {
    function onAuthRequired() { setShowLogin(true); }
    window.addEventListener('budget:external-auth-required', onAuthRequired);
    return () => window.removeEventListener('budget:external-auth-required', onAuthRequired);
  }, []);

  // Pas en mode externe (ingress HA) : on monte direct, l'auth est gérée par l'ingress.
  if (!external) return <>{children}</>;

  if (showLogin || me.isError) {
    return (
      <ExternalLogin
        onAuthed={() => {
          setShowLogin(false);
          qc.invalidateQueries();
        }}
      />
    );
  }

  if (me.isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <p className="muted small">Connexion…</p>
      </div>
    );
  }

  return (
    <>
      {children}
      <ExternalSessionBadge onLogout={() => {
        clearExternalToken();
        setShowLogin(true);
      }} />
    </>
  );
}

function ExternalSessionBadge({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      onClick={onLogout}
      title="Se déconnecter (session externe)"
      style={{
        position: 'fixed', top: 12, right: 12, zIndex: 5,
        background: 'var(--amber-bg, oklch(0.94 0.04 80))',
        color: 'var(--amber, oklch(0.5 0.12 80))',
        border: '1px solid var(--amber, oklch(0.78 0.12 80))',
        padding: '6px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      Session externe — déconnexion
    </button>
  );
}
