import { Router } from 'express';
import { z } from 'zod';
import { COFFEE_IDS, GRINDS, ORDER_STATUSES, TODAY, nextStatus, round2, type Order } from '../domain.js';
import { coffees } from '../seed.js';
import { ApiError, notFound, parse } from '../http.js';
import type { Store, Tx } from '../store/index.js';

const priceOf = (id: string) => coffees.find((c) => c.id === id)!.pricePerKg;
const nameOf = (id: string) => coffees.find((c) => c.id === id)!.name;

/** Shape returned to clients: names, line totals, totals and the allowed next status. */
export function presentOrder(o: Order) {
  const lines = o.lines.map((l) => ({
    coffeeId: l.coffeeId,
    coffee: nameOf(l.coffeeId),
    kg: l.kg,
    grind: l.grind,
    lineTotal: round2(l.kg * priceOf(l.coffeeId)),
  }));
  return {
    id: o.id,
    customer: o.customer,
    city: o.city,
    lines,
    due: o.due,
    status: o.status,
    totalKg: lines.reduce((s, l) => s + l.kg, 0),
    total: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    ...(o.note && { note: o.note }),
    nextStatus: nextStatus(o.status),
  };
}

const isoDate = z.iso.date();
const notInPast = isoDate.refine((d) => d >= TODAY, { message: `Must be ${TODAY} or later` });

const listQuery = z.object({
  status: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()))
    .pipe(z.array(z.enum(ORDER_STATUSES)))
    .optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['due', '-due', 'total', '-total']).default('due'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const newOrder = z.object({
  customer: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  lines: z
    .array(
      z.object({
        coffeeId: z.enum(COFFEE_IDS),
        kg: z.number().min(0.5).max(200),
        grind: z.enum(GRINDS),
      }),
    )
    .min(1)
    .max(10),
  due: notInPast,
  note: z.string().trim().max(280).optional(),
});

const orderUpdate = z
  .object({ due: notInPast.optional(), note: z.string().trim().max(280).optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one of: due, note' });

const statusChange = z.object({ status: z.enum(ORDER_STATUSES) });

export function ordersRouter(store: Store) {
  const r = Router();
  r.get('/', async (req, res) => {
    const q = parse(listQuery, req.query);
    let rows = (await store.read((t) => t.listOrders())).map(presentOrder);

    if (q.status) rows = rows.filter((o) => q.status!.includes(o.status));
    if (q.dueFrom) rows = rows.filter((o) => o.due >= q.dueFrom!);
    if (q.dueTo) rows = rows.filter((o) => o.due <= q.dueTo!);
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter((o) => [o.id, o.customer, o.city].some((f) => f.toLowerCase().includes(needle)));
    }

    const key = q.sort.replace('-', '') as 'due' | 'total';
    const dir = q.sort.startsWith('-') ? -1 : 1;
    rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id.localeCompare(b.id)) * dir);

    const start = (q.page - 1) * q.pageSize;
    res.json({ data: rows.slice(start, start + q.pageSize), page: q.page, pageSize: q.pageSize, total: rows.length });
  });

  r.get('/:id', async (req, res) => {
    const order = await store.read((t) => t.getOrder(req.params.id));
    if (!order) throw notFound(`Order ${req.params.id}`);
    res.json(presentOrder(order));
  });

  r.post('/', async (req, res) => {
    const body = parse(newOrder, req.body);
    const order = await store.tx((t) => t.insertOrder({ status: 'New', ...body }));
    res.status(201).location(`/api/v1/orders/${order.id}`).json(presentOrder(order));
  });

  /** Loads an order with its row locked, so concurrent edits are applied one after the other. */
  const lockOrder = async (t: Tx, id: string): Promise<Order> => {
    const order = await t.getOrder(id, { lock: true });
    if (!order) throw notFound(`Order ${id}`);
    return order;
  };

  r.patch('/:id', async (req, res) => {
    const body = parse(orderUpdate, req.body);
    const order = await store.tx(async (t) => {
      const order = await lockOrder(t, req.params.id);
      if (order.status !== 'New') {
        throw new ApiError(409, 'ORDER_LOCKED', `Only New orders can be edited (${order.id} is ${order.status})`);
      }
      Object.assign(order, body);
      await t.updateOrder(order);
      return order;
    });
    res.json(presentOrder(order));
  });

  r.post('/:id/status', async (req, res) => {
    const { status } = parse(statusChange, req.body);
    const order = await store.tx(async (t) => {
      const order = await lockOrder(t, req.params.id);
      const allowed = nextStatus(order.status);
      if (status !== allowed) {
        throw new ApiError(409, 'INVALID_TRANSITION', `Cannot move ${order.id} from ${order.status} to ${status}`, {
          from: order.status,
          to: status,
          allowed,
        });
      }
      order.status = status;
      await t.updateOrder(order);
      return order;
    });
    res.json(presentOrder(order));
  });

  return r;
}
