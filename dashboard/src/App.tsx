import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Batch, GreenStock as Stock, NOW, Order, OrderStatus, orderKg, ShippedWeek } from './data';
import {
  advanceOrder,
  ApiError,
  can,
  fetchBatches,
  fetchOrders,
  fetchShippedByWeek,
  fetchStock,
  hasStoredSession,
  logout,
  onSessionChange,
  refreshSession,
  type User,
} from './api';
import { SignIn } from './components/SignIn';
import { longDate, usd } from './format';
import { RoastSchedule } from './components/RoastSchedule';
import { OrdersTable } from './components/OrdersTable';
import { OrderDrawer } from './components/OrderDrawer';
import { GreenStock } from './components/GreenStock';
import { ShippedChart } from './components/ShippedChart';
import { BatchList } from './components/BatchList';
import { InventoryTable } from './components/InventoryTable';
import { CustomersTable } from './components/CustomersTable';

type Theme = 'light' | 'dark';

const ROLE_LABEL = { admin: 'Admin', production: 'Production', viewer: 'Viewer (read only)' } as const;
const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Each page has its own #hash so the browser Back button and shared links work. */
const VIEWS = [
  { id: 'overview', label: 'Overview', title: 'Today at the roastery' },
  { id: 'orders', label: 'Orders', title: 'Wholesale orders' },
  { id: 'roasting', label: 'Roasting', title: 'Roasting' },
  { id: 'inventory', label: 'Inventory', title: 'Green coffee inventory' },
  { id: 'customers', label: 'Customers', title: 'Customers' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

function readView(): ViewId {
  const h = window.location.hash.replace('#', '');
  return (VIEWS.find((v) => v.id === h)?.id ?? 'overview') as ViewId;
}

function readTheme(): Theme {
  // Respect a theme the host page has already set on <html>.
  const preset = document.documentElement.dataset.theme;
  if (preset === 'light' || preset === 'dark') return preset;
  try {
    const t = localStorage.getItem('roastline-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(hasStoredSession);
  const [signInNotice, setSignInNotice] = useState<string | undefined>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [greenStock, setGreenStock] = useState<Stock[]>([]);
  const [shipped, setShipped] = useState<ShippedWeek[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Order | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<ViewId>(readView);
  const signOutRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    const onHash = () => {
      setView(readView());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const current = VIEWS.find((v) => v.id === view)!;
  const searchable = view === 'overview' || view === 'orders' || view === 'customers';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('roastline-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Keep the signed-in user in sync with the API client (sign-in, refresh, expiry).
  useEffect(() => {
    let signedOutOnPurpose = false;
    let signedIn = false;
    const off = onSessionChange((u) => {
      if (signedIn && !u && !signedOutOnPurpose) setSignInNotice('Your session ended. Please sign in again.');
      if (u) setSignInNotice(undefined);
      signedOutOnPurpose = false;
      signedIn = !!u;
      setUser(u);
    });
    signOutRef.current = () => {
      signedOutOnPurpose = true;
      setSignInNotice(undefined);
      return logout();
    };
    if (hasStoredSession()) {
      refreshSession()
        .catch(() => {})
        .finally(() => setCheckingSession(false));
    }
    return off;
  }, []);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [o, b, s, w] = await Promise.all([fetchOrders(), fetchBatches(), fetchStock(), fetchShippedByWeek()]);
      setOrders(o);
      setBatches(b);
      setGreenStock(s);
      setShipped(w);
      setLoadState('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(async (o: Order, to: OrderStatus) => {
    setBusy(true);
    try {
      const updated = await advanceOrder(o.id, to);
      setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)));
      setOpen(updated);
      const verb = { Roasting: 'Moved to roasting', Packed: 'Marked as packed', Shipped: 'Marked as shipped', New: 'Reopened' }[to];
      setToast(`${verb}: ${o.id}, ${o.customer}`);
    } catch (e) {
      // The server is the source of truth: on a conflict (e.g. someone else already
      // moved this order) show its message and reload the order from the list.
      setToast(e instanceof ApiError ? `Couldn't update ${o.id}: ${e.message}` : `Couldn't update ${o.id}`);
      if (e instanceof ApiError && e.status === 401) return;
      if (e instanceof ApiError && e.status === 409) {
        fetchOrders()
          .then((list) => {
            setOrders(list);
            setOpen(list.find((x) => x.id === o.id) ?? null);
          })
          .catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const closeDrawer = useCallback(() => setOpen(null), []);

  const kpis = useMemo(() => {
    const today = orders.filter((o) => o.due === NOW.date);
    const leaving = today.filter((o) => o.status !== 'Shipped');
    const ready = leaving.filter((o) => o.status === 'Packed').length;
    const open = orders.filter((o) => o.status === 'New').length;
    const week = orders.filter((o) => o.due >= '2026-11-02' && o.due <= '2026-11-08');
    const low = greenStock.filter((s) => s.kg < s.reorderAt);
    return [
      { label: 'Leaving today', value: `${leaving.reduce((s, o) => s + orderKg(o), 0)} kg`, note: `${ready} of ${leaving.length} orders packed` },
      { label: 'New orders', value: String(open), note: 'Waiting to be scheduled' },
      { label: 'Booked this week', value: usd(week.reduce((s, o) => s + o.total, 0)), note: `${week.length} wholesale orders` },
      { label: 'Green coffee low', value: String(low.length), note: low.map((s) => s.origin).join(' and '), alert: low.length > 0 },
    ];
  }, [orders, greenStock]);

  if (checkingSession) {
    return (
      <div className="signin">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <SignIn notice={signInNotice} />;

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>

      <aside className={`sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="sidebar-inner">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <ellipse cx="16" cy="16" rx="9" ry="13" transform="rotate(28 16 16)" fill="var(--bean)" />
            <path d="M11 6.5c6 5 4 13 10 19" stroke="var(--ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </svg>
          <span>Roastline</span>
        </div>
        <nav aria-label="Main">
          <ul>
            {VIEWS.map((v) => (
              <li key={v.id}>
                <a href={`#${v.id}`} aria-current={v.id === view ? 'page' : undefined} onClick={() => setNavOpen(false)}>
                  {v.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-foot">
          <div className="avatar" aria-hidden="true">{initials(user.name)}</div>
          <div className="user-meta">
            <div>{user.name}</div>
            <div className="small faint">{ROLE_LABEL[user.role]}</div>
          </div>
          <button type="button" className="signout" onClick={() => signOutRef.current?.()}>
            Sign out
          </button>
        </div>
        </div>
      </aside>
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="greeting">
            <h1>{current.title}</h1>
            <p className="muted">{longDate(NOW.date)}</p>
          </div>
          <label className="search" hidden={!searchable}>
            <span className="visually-hidden">Search orders</span>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" fill="none" />
              <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder={view === 'customers' ? 'Search cafés or cities' : 'Search cafés, orders, coffees'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </header>

        <main id="main" aria-busy={loadState === 'loading'}>
          {loadState === 'loading' && <p className="load-state muted">Loading data from the API…</p>}
          {loadState === 'error' && (
            <div className="load-state load-error" role="alert">
              <p>
                <strong>Couldn't load data.</strong> {loadError}
              </p>
              <button type="button" className="btn-primary" onClick={load}>
                Try again
              </button>
            </div>
          )}
          {loadState === 'ready' && (
          <>
          {view === 'overview' && (
          <>
          <dl className="kpis">
            {kpis.map((k) => (
              <div key={k.label} className={k.alert ? 'kpi is-alert' : 'kpi'}>
                <dt>{k.label}</dt>
                <dd>
                  <span className="kpi-value">{k.value}</span>
                  <span className="kpi-note">{k.note}</span>
                </dd>
              </div>
            ))}
          </dl>

          <RoastSchedule batches={batches} />

          <div className="grid">
            <OrdersTable orders={orders} query={query} onOpen={setOpen} />
            <div className="side-stack">
              <GreenStock stock={greenStock} />
              <ShippedChart data={shipped} />
            </div>
          </div>
          </>
          )}

          {view === 'orders' && <OrdersTable orders={orders} query={query} onOpen={setOpen} pageSize={15} />}

          {view === 'roasting' && (
            <div className="stack">
              <RoastSchedule batches={batches} />
              <BatchList batches={batches} />
            </div>
          )}

          {view === 'inventory' && (
            <div className="stack">
              <div className="grid-even">
                <GreenStock stock={greenStock} />
                <ShippedChart data={shipped} />
              </div>
              <InventoryTable stock={greenStock} batches={batches} />
            </div>
          )}

          {view === 'customers' && <CustomersTable orders={orders} query={query} />}
          </>
          )}
        </main>
      </div>

      <OrderDrawer order={open} onClose={closeDrawer} onAdvance={advance} busy={busy} canAdvance={can.advanceOrder(user)} />

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
