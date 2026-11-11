import { FormEvent, ReactNode, useEffect, useRef } from 'react';

/** Side drawer holding one form: title, fields, a form-level error and the submit button. Closes on Esc. */
export function FormDrawer({
  title,
  subtitle,
  submitLabel,
  busy,
  error,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const firstField = useRef<HTMLFormElement>(null);

  useEffect(() => {
    firstField.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };

  return (
    <div className="drawer-backdrop" onClick={() => !busy && onClose()}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <h2 id="form-title">{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </header>

        <form ref={firstField} className="form form-drawer" onSubmit={submit} noValidate>
          {children}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="drawer-foot">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

/** Label + input wrapper that shows the field's error and marks it invalid for screen readers. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className ?? ''}`} data-invalid={error ? 'true' : undefined}>
      <span>{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="muted small">{hint}</span>
      )}
    </label>
  );
}
