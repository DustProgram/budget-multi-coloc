interface EmptyStateProps {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, body, action, onAction, icon }: EmptyStateProps) {
  return (
    <div style={{
      padding: '64px 24px',
      textAlign: 'center',
      border: '1px dashed var(--line-strong)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-elev)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: '50%',
        background: 'var(--accent-bg)',
        color: 'var(--accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
      }}>
        {icon}
      </div>
      <h3 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: 0 }}>{title}</h3>
      {body && <p style={{ color: 'var(--ink-3)', margin: '0 0 12px', maxWidth: 380 }}>{body}</p>}
      {action && (
        <button className="btn btn-primary" onClick={onAction}>{action}</button>
      )}
    </div>
  );
}
