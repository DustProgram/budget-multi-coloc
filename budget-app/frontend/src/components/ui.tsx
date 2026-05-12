import {
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

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames('input', props.className)} />;
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
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)', padding: 24,
          width: `min(${width}px, 100%)`, maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 26, margin: '0 0 16px', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
