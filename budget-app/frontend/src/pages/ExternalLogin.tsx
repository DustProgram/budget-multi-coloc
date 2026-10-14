import { useState } from 'react';
import { LogIn, AlertTriangle, User, Lock, Fingerprint, KeyRound } from 'lucide-react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from '../lib/api';
import { markLoggedIn } from '../lib/external-auth';

interface LoginOut {
  user_id: number | null;
  display_name: string | null;
  scope: 'coloc' | 'full' | null;
  mfa_required: boolean;
  passkey_options: PublicKeyCredentialRequestOptionsJSON | null;
}

function detail(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Passkey annulée ou expirée.';
  return fallback;
}

export function ExternalLogin({ onAuthed }: { onAuthed: (scope: 'coloc' | 'full') => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfa, setMfa] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  function done(data: LoginOut) {
    markLoggedIn();
    onAuthed(data.scope ?? 'full');
  }

  function restart(msg: string) {
    setMfa(null); setUseRecovery(false); setRecoveryCode(''); setPassword('');
    setError(msg);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginOut>(
        '/auth/login/password',
        { username: username.trim(), password },
      );
      if (data.mfa_required && data.passkey_options) setMfa(data.passkey_options);
      else done(data);
    } catch (err: unknown) {
      setError(detail(err, 'Identifiants invalides'));
    } finally {
      setLoading(false);
    }
  }

  async function withPasskey() {
    if (!mfa) return;
    setError(null);
    setLoading(true);
    try {
      const credential = await startAuthentication({ optionsJSON: mfa });
      const { data } = await api.post<LoginOut>('/auth/login/passkey', { credential });
      done(data);
    } catch (err: unknown) {
      const msg = detail(err, 'Passkey refusée.');
      // Annulation côté navigateur : on peut réessayer avec le même challenge
      if (err instanceof Error && err.name === 'NotAllowedError') setError(msg);
      else restart(msg);
    } finally {
      setLoading(false);
    }
  }

  async function withRecovery(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginOut>('/auth/login/recovery', { code: recoveryCode });
      done(data);
    } catch (err: unknown) {
      restart(detail(err, 'Code invalide.'));
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
          Connecte-toi avec tes identifiants. Si tu n'en as pas, demande à
          l'administrateur de t'en créer un.
        </p>

        {mfa ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="small" style={{ margin: 0 }}>
              Mot de passe correct. Confirme avec ta passkey (Face ID, Touch ID, empreinte…).
            </p>
            {!useRecovery ? (
              <>
                <button type="button" className="btn primary" onClick={withPasskey}
                  disabled={loading} style={{ justifyContent: 'center' }} autoFocus>
                  <Fingerprint size={14} /> {loading ? 'Vérification…' : 'Utiliser ma passkey'}
                </button>
                <button type="button" className="btn ghost small" onClick={() => { setUseRecovery(true); setError(null); }}>
                  J'ai perdu mon appareil : utiliser un code de secours
                </button>
              </>
            ) : (
              <form onSubmit={withRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span className="field-label row gap-2" style={{ alignItems: 'center' }}>
                    <KeyRound size={12} /> Code de secours
                  </span>
                  <input className="input" value={recoveryCode} autoFocus required
                    onChange={(e) => setRecoveryCode(e.target.value)} placeholder="XXXXX-XXXXX"
                    autoComplete="one-time-code" />
                </label>
                <button type="submit" className="btn primary" disabled={loading || !recoveryCode.trim()}
                  style={{ justifyContent: 'center' }}>
                  <LogIn size={14} /> Valider le code
                </button>
              </form>
            )}
            {error && <ErrorLine message={error} />}
          </div>
        ) : (
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

          {error && <ErrorLine message={error} />}

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
        )}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="small" style={{
      padding: '10px 12px', borderRadius: 10,
      background: 'var(--rose-bg)', color: 'var(--rose)',
      border: '1px solid var(--rose)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <AlertTriangle size={14} />
      {message}
    </div>
  );
}
