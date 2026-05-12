import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, ExternalLink, LogIn, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { setExternalToken } from '../lib/external-auth';
import { Avatar } from '../components/Avatar';

interface LoginUserEntry {
  user_id: number;
  display_name: string;
  ha_username: string;
  color_hex: string;
  has_external_token: boolean;
}

interface VerifyOut {
  user_id: number;
  display_name: string;
  ha_username: string;
}

export function ExternalLogin({ onAuthed }: { onAuthed: () => void }) {
  const users = useQuery({
    queryKey: ['auth-login-users'],
    queryFn: async () => (await api.get<LoginUserEntry[]>('/auth/login/users')).data,
  });

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<VerifyOut>('/auth/login/verify', { token: token.trim() });
      setExternalToken(token.trim());
      if (selectedUserId && data.user_id !== selectedUserId) {
        setError(`Ce token appartient à ${data.display_name}, pas à l'user sélectionné.`);
      } else {
        onAuthed();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Token invalide';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(440px, 100%)',
        background: 'var(--bg-elev)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px 32px',
      }}>
        <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 6 }}>
          <div className="brand-mark" style={{ width: 36, height: 36, fontSize: 22 }}>€</div>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Budget Multi-Coloc</p>
            <h1 style={{
              fontFamily: 'var(--display)', fontSize: 28,
              letterSpacing: '-0.01em', margin: '2px 0 0',
            }}>
              Connexion externe
            </h1>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 12, marginBottom: 22 }}>
          Tu accèdes à l'app depuis le port externe (sans Home Assistant).
          Sélectionne ton profil et colle ton token personnel pour entrer.
        </p>

        {users.isLoading && <p className="muted small">Chargement des utilisateurs…</p>}

        {users.data && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Qui es-tu ?</div>
              {users.data.length === 0 ? (
                <div className="small muted" style={{
                  padding: 14, background: 'var(--bg-sunken)', borderRadius: 10,
                }}>
                  Aucun utilisateur n'est encore enregistré. Connecte-toi d'abord
                  via Home Assistant (l'ingress crée ton profil automatiquement).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {users.data.map((u) => (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(u.user_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px',
                        background: selectedUserId === u.user_id ? 'var(--bg-sunken)' : 'var(--bg-elev)',
                        border: selectedUserId === u.user_id ? '2px solid var(--ink)' : '1px solid var(--line)',
                        borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'inherit', color: 'var(--ink)',
                      }}
                    >
                      <Avatar user={{ display_name: u.display_name, color_hex: u.color_hex }} size={32} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{u.display_name}</div>
                        <div className="small muted">{u.ha_username}</div>
                      </div>
                      {u.has_external_token ? (
                        <span className="pill sage">Token actif</span>
                      ) : (
                        <span className="pill" style={{ background: 'var(--bg-sunken)' }}>
                          Pas de token
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="field" style={{ margin: 0 }}>
              <span className="field-label row gap-2" style={{ alignItems: 'center' }}>
                <KeyRound size={12} /> Ton token externe
              </span>
              <input
                className="input"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Colle ici ton token"
                autoComplete="off"
                required
              />
            </label>

            {error && (
              <div className="small" style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'var(--rose-bg)', color: 'var(--rose)',
                border: '1px solid var(--rose)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn primary"
              disabled={!token.trim() || loading}
              style={{ justifyContent: 'center' }}
            >
              <LogIn size={14} />
              {loading ? 'Vérification…' : 'Entrer'}
            </button>

            <div className="small muted" style={{
              marginTop: 8, padding: '10px 12px', borderRadius: 10,
              background: 'var(--bg-sunken)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <ExternalLink size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Pas encore de token ? Connecte-toi via Home Assistant
                (interface ingress), puis va dans <strong>Réglages → Token d'accès externe</strong>
                pour en générer un.
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
