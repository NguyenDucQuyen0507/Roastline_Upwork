import { FormEvent, useEffect, useState } from 'react';
import { ApiError, login } from '../api';

const DEMO_PASSWORD = 'roastline-demo';
const DEMO_ACCOUNTS = [
  { email: 'admin@roastline.dev', name: 'Sam Rivera', role: 'Admin', can: 'Everything, including taking orders' },
  { email: 'production@roastline.dev', name: 'Mara Okafor', role: 'Production', can: 'Move orders, schedule roasts, receive coffee' },
  { email: 'viewer@roastline.dev', name: 'Jo Chen', role: 'Viewer', can: 'Read only' },
];

export function SignIn({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  // Free hosting sleeps when idle; say so if the first request takes a while.
  useEffect(() => {
    if (!busy) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  const submit = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(email, password);
  };

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand brand-dark">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <ellipse cx="16" cy="16" rx="9" ry="13" transform="rotate(28 16 16)" fill="var(--bean)" />
            <path d="M11 6.5c6 5 4 13 10 19" stroke="var(--ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </svg>
          <span>Roastline</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Roastery operations: orders, roasting and green coffee.</p>
        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}

        <form className="form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary btn-block" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {slow && <p className="muted small">The demo server sleeps when idle and can take up to a minute to wake up.</p>}
        </form>

        <div className="demo-accounts">
          <h2>Try a demo account</h2>
          <ul>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" className="demo-account" disabled={busy} onClick={() => submit(a.email, DEMO_PASSWORD)}>
                  <span className="demo-role">{a.role}</span>
                  <span className="demo-name">{a.name}</span>
                  <span className="muted small">{a.can}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Password for all demo accounts: <code>{DEMO_PASSWORD}</code>. Demo data resets every night.
          </p>
        </div>
      </div>
    </div>
  );
}
