'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
          margin: '0 auto 20px',
          fontSize: 24,
        }}>✓</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 24, marginBottom: 8 }}>
          Vérifiez votre boîte mail
        </div>
        <p style={{ color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 24 }}>
          Un lien de connexion a été envoyé à <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
          Cliquez dessus pour accéder à votre compte.
        </p>
        <button
          className="btn"
          onClick={() => { setSent(false); setEmail(''); }}
          style={{ width: '100%' }}
        >
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Connexion
        </div>
        <p style={{ color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Entrez votre adresse e-mail pour recevoir un lien de connexion.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--ink-2)',
            marginBottom: 6,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}>
            Adresse e-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
            required
            autoFocus
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--bg-elev)',
              border: '1.5px solid var(--line)',
              borderRadius: 10,
              fontSize: 15,
              color: 'var(--ink)',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color .15s',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--line)')}
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--rose-bg)',
            border: '1px solid var(--rose)',
            borderRadius: 8,
            color: 'var(--rose)',
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !email}
          style={{ width: '100%', marginTop: 4 }}
        >
          {loading ? 'Envoi en cours…' : 'Envoyer le lien de connexion'}
        </button>
      </form>

      <div style={{
        marginTop: 24,
        paddingTop: 24,
        borderTop: '1px solid var(--line)',
        textAlign: 'center',
        fontSize: 14,
        color: 'var(--ink-3)',
      }}>
        Pas encore de compte ?{' '}
        <a href="/signup" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
          Créer un compte
        </a>
      </div>
    </div>
  );
}
