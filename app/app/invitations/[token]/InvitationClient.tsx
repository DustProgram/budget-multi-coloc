'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  token: string;
  invitation: {
    id: string;
    email: string | null;
    role: string;
    accounts: {
      name: string;
      spaces: { name: string } | null;
    } | null;
  };
  isAuthenticated: boolean;
}

export default function InvitationClient({ token, invitation, isAuthenticated }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(invitation.email ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const accountName = invitation.accounts?.name ?? 'compte partagé';

  async function handleAccept() {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      router.push('/dashboard?welcome=coloc');
    } else {
      const data = await res.json();
      setError(data.error ?? 'Une erreur est survenue.');
      setLoading(false);
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/invitations/${token}`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent-bg)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 24,
        }}>✓</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 24, marginBottom: 8 }}>
          Vérifiez votre boîte mail
        </div>
        <p style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Un lien a été envoyé à <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
          Cliquez dessus pour rejoindre le compte.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Vous êtes invité·e
        </div>
        <p style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Rejoignez le compte <strong style={{ color: 'var(--ink)' }}>{accountName}</strong> en tant que{' '}
          <span className={`pill pill-${invitation.role === 'admin' ? 'terra' : 'sage'}`}>
            {invitation.role}
          </span>.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--rose-bg)',
          border: '1px solid var(--rose)',
          borderRadius: 8,
          color: 'var(--rose)',
          fontSize: 14,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {isAuthenticated ? (
        <button
          className="btn-primary"
          onClick={handleAccept}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Traitement…' : `Rejoindre ${accountName}`}
        </button>
      ) : (
        <form onSubmit={handleEmailSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
            Connectez-vous ou créez un compte pour accepter l'invitation.
          </p>
          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 500,
              color: 'var(--ink-2)', marginBottom: 6,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              Adresse e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              required
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-elev)', border: '1.5px solid var(--line)',
                borderRadius: 10, fontSize: 15, color: 'var(--ink)',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--line)')}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !email}
            style={{ width: '100%' }}
          >
            {loading ? 'Envoi…' : 'Continuer avec ce mail'}
          </button>
        </form>
      )}
    </div>
  );
}
