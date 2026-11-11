/**
 * Client for the Roastline API. Responses are mapped onto the dashboard's own
 * types in data.ts, so components don't need to know the API's shapes.
 *
 * Sessions: the short-lived access token lives only in memory; the refresh
 * token is kept in localStorage so a reload stays signed in. A 401 triggers one
 * refresh and a retry. Refreshes are single-flight and, through the Web Locks
 * API, one tab at a time: the API rotates refresh tokens and treats a reused
 * one as stolen, so two tabs refreshing with the same token would sign out both.
 */
import type { Batch, GreenStock, Order, OrderStatus, ShippedWeek } from './data';

const BASE = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');
const REFRESH_KEY = 'roastline-refresh-token';

export type Role = 'admin' | 'production' | 'viewer';
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** What each role may do, mirroring the API's checks so the UI can hide what would fail. */
export const can = {
  advanceOrder: (u: User | null) => u?.role === 'admin' || u?.role === 'production',
  editOrders: (u: User | null) => u?.role === 'admin',
  manageBatches: (u: User | null) => u?.role === 'admin' || u?.role === 'production',
  receiveStock: (u: User | null) => u?.role === 'admin' || u?.role === 'production',
};

/** Error in the API's standard shape: { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/* ---------- session ---------- */

let accessToken: string | null = null;
let currentUser: User | null = null;
let refreshing: Promise<User> | null = null;
const listeners = new Set<(u: User | null) => void>();

const readRefresh = () => {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
};
const writeRefresh = (t: string | null) => {
  try {
    if (t) localStorage.setItem(REFRESH_KEY, t);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
};

function setSession(s: { accessToken: string; refreshToken: string; user: User } | null) {
  accessToken = s?.accessToken ?? null;
  currentUser = s?.user ?? null;
  writeRefresh(s?.refreshToken ?? null);
  listeners.forEach((fn) => fn(currentUser));
}

/** Called with the user on sign-in and with null on sign-out or when the session ends. */
export function onSessionChange(fn: (u: User | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const hasStoredSession = () => readRefresh() !== null;

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Can't reach the API at ${BASE}`);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body as T;
}

const withTabLock = <T,>(fn: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('roastline-refresh', fn) : fn();

/** Swaps the stored refresh token for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<User> {
  refreshing ??= withTabLock(async () => {
    // Read inside the lock: another tab may have just rotated the token.
    const token = readRefresh();
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');
    try {
      const s = await parse<{ accessToken: string; refreshToken: string; user: User }>(
        await send('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: token }) }, null),
      );
      setSession(s);
      return s.user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSession(null);
      throw e;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function login(email: string, password: string): Promise<User> {
  const s = await parse<{ accessToken: string; refreshToken: string; user: User }>(
    await send('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, null),
  );
  setSession(s);
  return s.user;
}

export async function logout() {
  const token = readRefresh();
  setSession(null);
  if (token) await send('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: token }) }, null).catch(() => {});
}

/** Authenticated request: on a 401, refresh the session once and retry. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken && hasStoredSession()) await refreshSession();
  let res = await send(path, init, accessToken);
  if (res.status === 401 && hasStoredSession()) {
    await refreshSession();
    res = await send(path, init, accessToken);
  }
  return parse<T>(res);
}

/* ---------- API shapes ---------- */

interface ApiOrder {
  id: string;
  customer: string;
  city: string;
  lines: { coffeeId: string; coffee: string; kg: number; grind: Order['lines'][number]['grind']; lineTotal: number }[];
  due: string;
  status: OrderStatus;
  totalKg: number;
  total: number;
  note?: string;
  nextStatus: OrderStatus | null;
}

interface ApiBatch {
  id: string;
  coffeeId: string;
  coffee: string;
  roaster: Batch['roaster'];
  start: string; // HH:MM
  end: string;
  durationMin: number;
  kg: number;
  roastLevel: Batch['roast'];
  greenKgUsed: number;
}

interface ApiStock {
  coffeeId: string;
  coffee: string;
  origin: string;
  kg: number;
  reorderAt: number;
  capacity: number;
  level: 'ok' | 'low' | 'critical';
}

interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/* ---------- mappers ---------- */

const toOrder = (o: ApiOrder): Order => ({
  id: o.id,
  customer: o.customer,
  city: o.city,
  lines: o.lines.map((l) => ({ coffee: l.coffee, kg: l.kg, grind: l.grind })),
  due: o.due,
  status: o.status,
  total: o.total,
  ...(o.note && { note: o.note }),
});

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const toBatch = (b: ApiBatch): Batch => ({
  id: b.id,
  coffee: b.coffee,
  start: minutes(b.start),
  duration: b.durationMin,
  kg: b.kg,
  roast: b.roastLevel,
  roaster: b.roaster,
});

const toStock = (s: ApiStock): GreenStock => ({
  coffeeId: s.coffeeId,
  coffee: s.coffee,
  origin: s.origin,
  kg: s.kg,
  reorderAt: s.reorderAt,
  capacity: s.capacity,
});

/* ---------- endpoints ---------- */

/** All orders. The API pages at most 100 per request, so keep fetching until we have them all. */
export async function fetchOrders(): Promise<Order[]> {
  const all: ApiOrder[] = [];
  for (let page = 1; ; page++) {
    const res = await request<Page<ApiOrder>>(`/orders?pageSize=100&page=${page}&sort=due`);
    all.push(...res.data);
    if (all.length >= res.total || res.data.length === 0) break;
  }
  return all.map(toOrder);
}

export const fetchBatches = async () => (await request<{ data: ApiBatch[] }>('/batches')).data.map(toBatch);

export const fetchStock = async () => (await request<{ data: ApiStock[] }>('/inventory')).data.map(toStock);

export const fetchShippedByWeek = async () =>
  (await request<{ data: ShippedWeek[] }>('/reports/shipped-by-week')).data;

export async function advanceOrder(id: string, to: OrderStatus): Promise<Order> {
  const o = await request<ApiOrder>(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: to }),
  });
  return toOrder(o);
}

/* ---------- writes used by the forms ---------- */

export interface Coffee {
  id: string;
  name: string;
  origin: string;
  pricePerKg: number;
  isBlend: boolean;
}

export const fetchCoffees = async () => (await request<{ data: Coffee[] }>('/coffees')).data;

export interface NewOrder {
  customer: string;
  city: string;
  due: string;
  note?: string;
  lines: { coffeeId: string; kg: number; grind: Order['lines'][number]['grind'] }[];
}

export const createOrder = async (body: NewOrder) =>
  toOrder(await request<ApiOrder>('/orders', { method: 'POST', body: JSON.stringify(body) }));

export const updateOrder = async (id: string, body: { due?: string; note?: string }) =>
  toOrder(await request<ApiOrder>(`/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }));

export interface NewBatch {
  coffeeId: string;
  roaster: Batch['roaster'];
  start: string; // HH:MM
  durationMin: number;
  kg: number;
  roastLevel: number;
}

export const createBatch = async (body: NewBatch) =>
  toBatch(await request<ApiBatch>('/batches', { method: 'POST', body: JSON.stringify(body) }));

export const cancelBatch = (id: string) => request<void>(`/batches/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const recordReceipt = async (coffeeId: string, body: { kg: number; supplierRef?: string }) =>
  toStock(
    await request<ApiStock>(`/inventory/${encodeURIComponent(coffeeId)}/receipts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

/**
 * Field-level messages from a 400 VALIDATION_ERROR, keyed by the API's path
 * (e.g. "customer", "lines.0.kg"), so forms can show them next to the input.
 */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR' || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path: string; message: string }[]) out[d.path || 'form'] ??= d.message;
  return out;
}
