'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Step = 'profile' | 'space';

const COLOR_OPTIONS = [
  { value: 'terra', label: 'Terre', hex: '#c07a5a' },
  { value: 'sage', label: 'Sauge', hex: '#5a8a6a' },
  { value: 'plum', label: 'Prune', hex: '#7a5a8a' },
  { value: 'amber', label: 'Ambre', hex: '#b07a3a' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('profile');
  const [name, setName] = useState('');
  const [color, setColor] = useState('terra');
  const [spaceName, setSpaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  async function handleProfileNext(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setStep('space');
  }

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    // Upsert user profile
    const { error: profileError } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        name: name.trim(),
        color,
        initial,
        email: user.email,
      });

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    // Create perso space
    const { error: spaceError } = await supabase
      .from('spaces')
      .insert({
        user_id: user.id,
        name: spaceName.trim() || `${name.trim()}'s budget`,
        kind: 'perso',
      });

    if (spaceError && !spaceError.message.includes('duplicate')) {
      setError(spaceError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
        {(['profile', 'space'] as Step[]).map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1, height: 3, borderRadius: 99,
              background: i <= (['profile', 'space'] as Step[]).indexOf(step)
                ? 'var(--accent)'
                : 'var(--line)',
              transition: 'background .3s',
            }}
          />
        ))}
      </div>

      {step === 'profile' && (
        <form onSubmit={handleProfileNext} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: '-0.02em', marginBottom: 6 }}>
              Votre profil
            </div>
            <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.5 }}>
              Vos colocataires vous verront avec ces infos.
            </p>
          </div>

          {/* Avatar preview */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: `var(--${color})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--display)', fontSize: 30, color: '#fff',
              transition: 'background .2s',
            }}>
              {initial}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Votre prénom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Lucas"
              required
              autoFocus
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--line)')}
            />
          </div>

          <div>
            <label style={labelStyle}>Couleur</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColor(opt.value)}
                  title={opt.label}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: opt.hex,
                    border: color === opt.value ? '3px solid var(--ink)' : '3px solid transparent',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'border-color .15s',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!name.trim()}
            style={{ width: '100%' }}
          >
            Continuer
          </button>
        </form>
      )}

      {step === 'space' && (
        <form onSubmit={handleFinish} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: '-0.02em', marginBottom: 6 }}>
              Votre espace perso
            </div>
            <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.5 }}>
              C'est là que vous gérerez vos comptes et budgets personnels.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Nom de l'espace</label>
            <input
              type="text"
              value={spaceName}
              onChange={e => setSpaceName(e.target.value)}
              placeholder={`${name.trim() || 'Mon'}'s budget`}
              autoFocus
              style={inputStyle}
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

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setStep('profile')}
              style={{ flex: 1 }}
            >
              Retour
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ flex: 2 }}
            >
              {loading ? 'Création…' : 'Commencer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink-2)',
  marginBottom: 6,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
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
};
