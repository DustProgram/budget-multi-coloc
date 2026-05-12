export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: 'var(--ink)', color: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--display)', fontSize: 22,
          }}>€</div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '-0.01em' }}>
              Compte gestion
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
              Multi-coloc · v2.0
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
