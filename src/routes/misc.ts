import { Router } from 'express';
import { z } from 'zod';
import { COFFEE_IDS, round1, stockLevel, type StockRecord } from '../domain.js';
import { coffees, shippedByWeek } from '../seed.js';
import { ApiError, notFound, parse } from '../http.js';
import type { Store } from '../store.js';
import { presentOrder } from './orders.js';

const coffee = (id: string) => coffees.find((c) => c.id === id)!;

function presentStock(s: StockRecord) {
  const c = coffee(s.coffeeId);
  return {
    coffeeId: s.coffeeId,
    coffee: c.name,
    origin: c.origin,
    kg: s.kg,
    reorderAt: s.reorderAt,
    capacity: s.capacity,
    level: stockLevel(s),
  };
}

export function coffeesRouter() {
  const r = Router();
  r.get('/', (_req, res) => res.json({ data: coffees }));
  return r;
}

const inventoryQuery = z.object({ level: z.enum(['ok', 'low', 'critical']).optional() });
const receipt = z.object({ kg: z.number().min(1), supplierRef: z.string().trim().max(40).optional() });
const coffeeIdParam = z.enum(COFFEE_IDS);

export function inventoryRouter(store: Store) {
  const r = Router();

  r.get('/', (req, res) => {
    const q = parse(inventoryQuery, req.query);
    const rows = store.stock
      .map(presentStock)
      .filter((s) => !q.level || s.level === q.level)
      .sort((a, b) => a.kg / a.reorderAt - b.kg / b.reorderAt);
    res.json({ data: rows });
  });

  r.post('/:coffeeId/receipts', (req, res) => {
    const idCheck = coffeeIdParam.safeParse(req.params.coffeeId);
    const s = idCheck.success ? store.stock.find((x) => x.coffeeId === idCheck.data) : undefined;
    if (!s) throw notFound(`Green stock for ${req.params.coffeeId}`);

    const { kg } = parse(receipt, req.body);
    const spaceLeft = round1(s.capacity - s.kg);
    if (kg > spaceLeft) {
      throw new ApiError(
        422,
        'STORAGE_CAPACITY_EXCEEDED',
        `Only ${spaceLeft} kg of space left for ${coffee(s.coffeeId).name}`,
        { spaceLeftKg: spaceLeft },
      );
    }
    s.kg = round1(s.kg + kg);
    res.json(presentStock(s));
  });

  return r;
}

const customersQuery = z.object({ sort: z.enum(['name', '-totalSpent', '-lastOrderDue']).default('-totalSpent') });

export function customersRouter(store: Store) {
  const r = Router();
  r.get('/', (req, res) => {
    const { sort } = parse(customersQuery, req.query);
    const byName = new Map<string, { name: string; city: string; orderCount: number; openOrders: number; totalSpent: number; lastOrderDue: string }>();

    for (const o of store.orders.map(presentOrder)) {
      const c = byName.get(o.customer) ?? { name: o.customer, city: o.city, orderCount: 0, openOrders: 0, totalSpent: 0, lastOrderDue: o.due };
      c.orderCount += 1;
      if (o.status !== 'Shipped') c.openOrders += 1;
      c.totalSpent = Math.round((c.totalSpent + o.total) * 100) / 100;
      if (o.due > c.lastOrderDue) c.lastOrderDue = o.due;
      byName.set(o.customer, c);
    }

    const rows = [...byName.values()].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === '-totalSpent'
          ? b.totalSpent - a.totalSpent
          : b.lastOrderDue.localeCompare(a.lastOrderDue),
    );
    res.json({ data: rows });
  });
  return r;
}

export function reportsRouter() {
  const r = Router();
  r.get('/shipped-by-week', (_req, res) => res.json({ data: shippedByWeek }));
  return r;
}
