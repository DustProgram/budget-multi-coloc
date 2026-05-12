import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogIn, AlertTriangle, User, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { markLoggedIn } from '../lib/external-auth';
import { Avatar } from '../components/Avatar';

interface LoginUserEntry {
  user_id: number;
  display_name: string;
  ha_username: string;
  color_hex: string;
  has_external_account: boolean;
  external_username: string | null;
}

interface LoginOut {
  user_id: number;
  display_name: string;
  scope: 'coloc' | 'full';
}

export function ExternalLogin({ onAuthed }: { onAuthed: (scope: 'coloc' | 'full') => void }) {
  const users = useQuery({
    queryKey: ['auth-login-users'],
    queryFn: async () => (await api.get<LoginUserEntry[]>('/auth/login/users')).data,
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginOut>(
        '/auth/login/password',
        { username: username.trim(), password },
      );
      markLoggedIn();
      onAuthed(data.scope);
    } catch (err: unknown) {
      let msg = 'Identifiants invalides';
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const r = (err as { response?: { data?: { detail?: string } } }).response;
        if (r?.data?.detail) msg = r.data.detail;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const accountsWithExtern = (users.data ?? []).filter((u) => u.has_external_account);

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
              Connexion
            </h1>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 12, marginBottom: 22 }}>
          Tu accèdes à l'app depuis le port externe (sans Home Assistant).
          Connecte-toi avec ton username et ton mot de passe.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label row gap-2" style={{ alignItems: 'center' }}>
              <User size={12} /> Username
            </span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex : lucas-ext"
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="field" style={{ margin: 0 }}>
            <span className="field-label row gap-2" style={{ alignItems: 'center' }}>
              <Lock size={12} /> Mot de passe
            </span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
            disabled={!username.trim() || !password || loading}
            style={{ justifyContent: 'center' }}
          >
            <LogIn size={14} />
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        {accountsWithExtern.length > 0 && (
          <details style={{ marginTop: 22 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Quels comptes peuvent se connecter ici ?
            </summary>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {accountsWithExtern.map((u) => (
                <div key={u.user_id} className="row gap-2" style={{
                  padding: '6px 10px', background: 'var(--bg-sunken)', borderRadius: 8,
                  fontSize: 12,
                }}>
                  <Avatar user={{ display_name: u.display_name, color_hex: u.color_hex }} size={22} />
                  <span style={{ fontWeight: 500 }}>{u.display_name}</span>
                  <code style={{
                    marginLeft: 'auto',
                    background: 'var(--bg-elev)', padding: '1px 6px', borderRadius: 4,
                    fontFamily: 'var(--mono, ui-monospace)', fontSize: 11,
                  }}>
                    {u.external_username}
                  </code>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="small muted" style={{
          marginTop: 18, padding: '10px 12px', borderRadius: 10,
          background: 'var(--bg-sunken)',
        }}>
          Pas encore de compte ? Connecte-toi via Home Assistant
          (interface ingress), puis va dans <strong>Réglages → Compte externe</strong>
          pour créer ton username et ton mot de passe.
        </div>
      </div>
    </div>
  );
}
