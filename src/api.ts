/**
 * Client for the Roastline API. Responses are mapped onto the dashboard's own
 * types in data.ts, so components don't need to know the API's shapes.
 */
import type { Batch, GreenStock, Order, OrderStatus, ShippedWeek } from './data';

const BASE = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');
const KEY = import.meta.env.VITE_API_KEY ?? 'demo-key';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const write = init.method && init.method !== 'GET';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(write ? { 'X-API-Key': KEY } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', `Can't reach the API at ${BASE}`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body as T;
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
