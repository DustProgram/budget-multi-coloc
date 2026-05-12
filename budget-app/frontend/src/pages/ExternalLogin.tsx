import { useState } from 'react';
import { LogIn, AlertTriangle, User, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { markLoggedIn } from '../lib/external-auth';

interface LoginOut {
  user_id: number;
  display_name: string;
  scope: 'coloc' | 'full';
}

export function ExternalLogin({ onAuthed }: { onAuthed: (scope: 'coloc' | 'full') => void }) {
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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(420px, 100%)',
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
          Connecte-toi avec tes identifiants externes. Si tu n'en as pas,
          crée-les via Home Assistant dans <strong>Réglages → Compte externe</strong>.
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
      </div>
    </div>
  );
}
