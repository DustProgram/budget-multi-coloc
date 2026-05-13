import {
  useEffect, useState,
  type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes,
  type TextareaHTMLAttributes, type ButtonHTMLAttributes,
} from 'react';
import { classNames } from '../lib/format';

export function PageHeader({
  eyebrow, title, subtitle, children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow" style={{ margin: 0 }}>{eyebrow}</p>}
        <h1 className="page-title" style={{ marginTop: 6 }}>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {children && <div className="row gap-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={classNames('card', className)} style={style}>{children}</div>;
}

type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'sm';

export function Button({
  variant = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const classes: Record<ButtonVariant, string> = {
    default: 'btn',
    primary: 'btn primary',
    accent: 'btn accent',
    ghost: 'btn ghost',
    sm: 'btn sm',
  };
  return <button {...props} className={classNames(classes[variant], className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Input({ onFocus, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const isNumeric = props.type === 'number';
  return (
    <input
      {...props}
      className={classNames('input', props.className)}
      onFocus={(e) => {
        if (isNumeric) e.target.select();
        onFocus?.(e);
      }}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classNames('select', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classNames('input', props.className)} />;
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'terra' | 'sage' | 'plum' | 'rose' | 'amber' }) {
  return <span className={classNames('pill', tone)}>{children}</span>;
}

export function EmptyState({
  icon, title, message, action,
}: { icon?: ReactNode; title?: string; message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      {title && <h3>{title}</h3>}
      <p>{message}</p>
      {action}
    </div>
  );
}

export function Loader() {
  return <p className="muted small">Chargement…</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <p className="neg small">{message}</p>;
}

export function Kpi({
  label, icon, value, sub, subClass, large, tinted,
}: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  subClass?: string;
  large?: boolean;
  tinted?: boolean;
}) {
  return (
    <div className={classNames('kpi', large && 'large', tinted && 'tinted')}>
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value display num">{value}</div>
      {sub && <div className={classNames('kpi-delta small', subClass)}>{sub}</div>}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  const [shaking, setShaking] = useState(false);

  // ESC ferme la modal (raccourci clavier desktop)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Clic en-dehors : NE FERME PAS. Déclenche un shake + vibration mobile
  // + flash sur le bouton Annuler pour orienter l'utilisateur.
  const onOutsideClick = () => {
    if (shaking) return;
    setShaking(true);
    if ('vibrate' in navigator) {
      try { navigator.vibrate?.(120); } catch { /* noop */ }
    }
    setTimeout(() => setShaking(false), 600);
  };

  return (
    <div className="modal-overlay" onClick={onOutsideClick}>
      <div
        className={classNames('modal-content', shaking && 'shaking')}
        onClick={(e) => e.stopPropagation()}
        style={{ width: `min(${width}px, 100%)` }}
      >
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '0 0 16px', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

