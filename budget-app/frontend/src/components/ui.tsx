import { type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { classNames } from '../lib/format';

export function PageHeader({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-brand">{icon}</span>}
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      {children}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={classNames('bg-white rounded-lg shadow-sm p-4', className)}>{children}</div>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles: Record<string, string> = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      {...props}
      className={classNames(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600 mb-1">
      {children}
    </label>
  );
}

const fieldBase =
  'w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand bg-white';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames(fieldBase, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classNames(fieldBase, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classNames(fieldBase, props.className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 bg-white rounded-lg shadow-sm">
      <p className="text-slate-500 text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Loader() {
  return <p className="text-slate-500 text-sm">Chargement…</p>;
}

export function ErrorBox({ message }: { message: string }) {
  return <p className="text-rose-600 text-sm">{message}</p>;
}
