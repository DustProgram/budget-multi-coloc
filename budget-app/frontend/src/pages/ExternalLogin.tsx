import { useState } from 'react';
import { LogIn, AlertTriangle, User, Lock, Fingerprint, KeyRound, Smartphone } from 'lucide-react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from '../lib/api';
import { markLoggedIn } from '../lib/external-auth';

type Method = 'totp' | 'passkey' | 'recovery';

interface LoginOut {
  user_id: number | null;
  display_name: string | null;
  scope: 'coloc' | 'full' | null;
  mfa_required: boolean;
  methods: Method[];
  passkey_options: PublicKeyCredentialRequestOptionsJSON | null;
}

interface Mfa {
  methods: Method[];
  passkeyOptions: PublicKeyCredentialRequestOptionsJSON | null;
}

function detail(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error && err.name === 'NotAllowedError') return 'Passkey annulée ou expirée.';
  return fallback;
}

const isCancel = (err: unknown) => err instanceof Error && err.name === 'NotAllowedError';

export function ExternalLogin({ onAuthed }: { onAuthed: (scope: 'coloc' | 'full') => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfa, setMfa] = useState<Mfa | null>(null);
  const [step, setStep] = useState<Method | null>(null);
  const [code, setCode] = useState('');

  function done(data: LoginOut) {
    markLoggedIn();
    onAuthed(data.scope ?? 'full');
  }

  function restart(msg: string) {
    setMfa(null); setStep(null); setCode(''); setPassword('');
    setError(msg);
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  }

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        const { data } = await api.post<LoginOut>('/auth/login/password', { username: username.trim(), password });
        if (!data.mfa_required) return done(data);
        setMfa({ methods: data.methods, passkeyOptions: data.passkey_options });
        setStep(data.methods.includes('totp') ? 'totp' : data.methods.includes('passkey') ? 'passkey' : 'recovery');
      } catch (err) {
        setError(detail(err, 'Identifiants invalides'));
      }
    });
  };

  const passwordless = () => run(async () => {
    try {
      const { data } = await api.post<{ passkey_options: PublicKeyCredentialRequestOptionsJSON }>('/auth/login/passkey/start');
      const credential = await startAuthentication({ optionsJSON: data.passkey_options });
      done((await api.post<LoginOut>('/auth/login/passkey/finish', { credential })).data);
    } catch (err) {
      setError(isCancel(err) ? 'Connexion annulée.' : detail(err, 'Aucune passkey reconnue pour ce site.'));
    }
  });

  const secondPasskey = () => run(async () => {
    if (!mfa?.passkeyOptions) return;
    try {
      const credential = await startAuthentication({ optionsJSON: mfa.passkeyOptions });
      done((await api.post<LoginOut>('/auth/login/passkey', { credential })).data);
    } catch (err) {
      // Annulation côté navigateur : on peut réessayer avec le même challenge
      if (isCancel(err)) setError(detail(err, ''));
      else restart(detail(err, 'Passkey refusée.'));
    }
  });

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      try {
        const path = step === 'totp' ? '/auth/login/totp' : '/auth/login/recovery';
        done((await api.post<LoginOut>(path, { code })).data);
      } catch (err) {
        // Un code d'appli faux peut être retapé ; un code de secours faux ferme l'étape
        if (step === 'totp') { setError(detail(err, 'Code incorrect.')); setCode(''); }
        else restart(detail(err, 'Code invalide.'));
      }
    });
  };

  return (
    <div style={{
      minHeight: '100dvh',
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
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '-0.01em', margin: '2px 0 0' }}>
              Connexion
            </h1>
          </div>
        </div>

        {!mfa ? (
          <>
            <button type="button" className="btn primary" onClick={passwordless} disabled={loading}
              style={{ justifyContent: 'center', width: '100%', marginTop: 18 }}>
              <Fingerprint size={14} /> Se connecter avec une passkey
            </button>
            <p className="small muted" style={{ textAlign: 'center', margin: '6px 0 0' }}>
              Face ID, Touch ID ou empreinte — sans mot de passe
            </p>

            <div className="row gap-2 small muted" style={{ alignItems: 'center', margin: '20px 0 14px' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              ou avec ton mot de passe
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>

            <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field" style={{ margin: 0 }}>
                <span className="field-label row gap-2" style={{ alignItems: 'center' }}><User size={12} /> Username</span>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username webauthn" required />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="field-label row gap-2" style={{ alignItems: 'center' }}><Lock size={12} /> Mot de passe</span>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" required />
              </label>
              {error && <ErrorLine message={error} />}
              <button type="submit" className="btn" disabled={!username.trim() || !password || loading}
                style={{ justifyContent: 'center' }}>
                <LogIn size={14} /> {loading ? 'Connexion…' : 'Continuer'}
              </button>
            </form>
            <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
              Pas de compte ? Demande à l'administrateur de t'en créer un.
            </p>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
            <p className="small" style={{ margin: 0 }}>Mot de passe correct. Deuxième étape :</p>

            {step === 'passkey' && (
              <button type="button" className="btn primary" onClick={secondPasskey} disabled={loading}
                style={{ justifyContent: 'center' }} autoFocus>
                <Fingerprint size={14} /> {loading ? 'Vérification…' : 'Utiliser ma passkey'}
              </button>
            )}

            {(step === 'totp' || step === 'recovery') && (
              <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label className="field" style={{ margin: 0 }}>
                  <span className="field-label row gap-2" style={{ alignItems: 'center' }}>
                    {step === 'totp' ? <><Smartphone size={12} /> Code de ton appli d'authentification</> : <><KeyRound size={12} /> Code de secours</>}
                  </span>
                  <input className="input" value={code} autoFocus required
                    onChange={(e) => setCode(e.target.value)}
                    inputMode={step === 'totp' ? 'numeric' : 'text'}
                    placeholder={step === 'totp' ? '123456' : 'XXXXX-XXXXX'}
                    maxLength={step === 'totp' ? 6 : 11}
                    autoComplete="one-time-code"
                    style={step === 'totp' ? { fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' } : undefined} />
                </label>
                <button type="submit" className="btn primary" disabled={loading || !code.trim()} style={{ justifyContent: 'center' }}>
                  <LogIn size={14} /> Valider
                </button>
              </form>
            )}

            {error && <ErrorLine message={error} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mfa.methods.filter((m) => m !== step).map((m) => (
                <button key={m} type="button" className="btn ghost small" onClick={() => { setStep(m); setError(null); setCode(''); }}>
                  {m === 'totp' && 'Utiliser plutôt le code de mon appli'}
                  {m === 'passkey' && 'Utiliser plutôt ma passkey'}
                  {m === 'recovery' && "J'ai perdu mon appareil : code de secours"}
                </button>
              ))}
            </div>
          </div>
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
