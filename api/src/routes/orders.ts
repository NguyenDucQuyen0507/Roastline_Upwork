import { Router } from 'express';
import { z } from 'zod';
import { COFFEE_IDS, GRINDS, ORDER_STATUSES, TODAY, nextStatus, round2, type Order } from '../domain.js';
import { coffees } from '../seed.js';
import { ApiError, financials, financialsForbidden, notFound, parse, requireRole } from '../http.js';
import type { Store, Tx } from '../store/index.js';
import { eventFor } from '../events.js';

const priceOf = (id: string) => coffees.find((c) => c.id === id)!.pricePerKg;
const nameOf = (id: string) => coffees.find((c) => c.id === id)!.name;

/**
 * Shape returned to clients: names, totals and the allowed next status.
 * `lineTotal` and `total` are left out entirely (not nulled) for roles that
 * don't see financials.
 */
export function presentOrder(o: Order, { financials = true } = {}) {
  const lines = o.lines.map((l) => ({
    coffeeId: l.coffeeId,
    coffee: nameOf(l.coffeeId),
    kg: l.kg,
    grind: l.grind,
    ...(financials && { lineTotal: round2(l.kg * priceOf(l.coffeeId)) }),
  }));
  return {
    id: o.id,
    customer: o.customer,
    city: o.city,
    lines,
    due: o.due,
    status: o.status,
    totalKg: lines.reduce((s, l) => s + l.kg, 0),
    ...(financials && { total: round2(o.lines.reduce((s, l) => s + l.kg * priceOf(l.coffeeId), 0)) }),
    ...(o.note && { note: o.note }),
    nextStatus: nextStatus(o.status),
  };
}

/** Removes the financial fields from an already presented order. */
function withoutFinancials(o: ReturnType<typeof presentOrder>) {
  const { total: _total, ...rest } = o;
  return { ...rest, lines: rest.lines.map(({ lineTotal: _lineTotal, ...l }) => l) };
}

const isoDate = z.iso.date('Use a date like 2026-11-09');
const notInPast = isoDate.refine((d) => d >= TODAY, { message: 'The due date can’t be in the past' });

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
  customer: z.string().trim().min(2, 'Enter the customer name (at least 2 characters)').max(80, 'Use at most 80 characters'),
  city: z.string().trim().min(2, 'Enter a city (at least 2 characters)').max(60, 'Use at most 60 characters'),
  lines: z
    .array(
      z.object({
        coffeeId: z.enum(COFFEE_IDS),
        kg: z.number({ error: 'Enter a weight in kg' }).min(0.5, 'At least 0.5 kg').max(200, 'At most 200 kg per line'),
        grind: z.enum(GRINDS),
      }),
    )
    .min(1, 'Add at least one coffee')
    .max(10, 'At most 10 coffees per order'),
  due: notInPast,
  note: z.string().trim().max(280, 'Use at most 280 characters').optional(),
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
    // Sorting by value would rank orders by price even with the totals hidden.
    if (q.sort.endsWith('total') && !financials(req)) throw financialsForbidden('sort orders by total');
    let rows = (await store.read((t) => t.listOrders())).map((o) => presentOrder(o)); // full, for sorting

    if (q.status) rows = rows.filter((o) => q.status!.includes(o.status));
    if (q.dueFrom) rows = rows.filter((o) => o.due >= q.dueFrom!);
    if (q.dueTo) rows = rows.filter((o) => o.due <= q.dueTo!);
    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter((o) => [o.id, o.customer, o.city].some((f) => f.toLowerCase().includes(needle)));
    }

    const key = q.sort.replace('-', '') as 'due' | 'total';
    const dir = q.sort.startsWith('-') ? -1 : 1;
    rows.sort((a, b) => (a[key]! < b[key]! ? -1 : a[key]! > b[key]! ? 1 : a.id.localeCompare(b.id)) * dir); // rows are fully presented here

    const start = (q.page - 1) * q.pageSize;
    const fin = financials(req);
    const page = rows.slice(start, start + q.pageSize).map((o) => (fin ? o : withoutFinancials(o)));
    res.json({ data: page, page: q.page, pageSize: q.pageSize, total: rows.length });
  });

  r.get('/:id', async (req, res) => {
    const order = await store.read((t) => t.getOrder(req.params.id));
    if (!order) throw notFound(`Order ${req.params.id}`);
    res.json(presentOrder(order, { financials: financials(req) }));
  });

  r.post('/', requireRole('admin'), async (req, res) => {
    const body = parse(newOrder, req.body);
    const order = await store.tx(async (t) => {
      const order = await t.insertOrder({ status: 'New', ...body });
      await t.emit(eventFor(req, 'order.created', order.id, `created ${order.id} for ${order.customer}`));
      return order;
    });
    res.status(201).location(`/api/v1/orders/${order.id}`).json(presentOrder(order, { financials: financials(req) }));
  });

  /** Loads an order with its row locked, so concurrent edits are applied one after the other. */
  const lockOrder = async (t: Tx, id: string): Promise<Order> => {
    const order = await t.getOrder(id, { lock: true });
    if (!order) throw notFound(`Order ${id}`);
    return order;
  };

  r.patch('/:id', requireRole('admin'), async (req, res) => {
    const body = parse(orderUpdate, req.body);
    const order = await store.tx(async (t) => {
      const order = await lockOrder(t, String(req.params.id));
      if (order.status !== 'New') {
        throw new ApiError(409, 'ORDER_LOCKED', `Only New orders can be edited (${order.id} is ${order.status})`);
      }
      Object.assign(order, body);
      await t.updateOrder(order);
      await t.emit(eventFor(req, 'order.updated', order.id, `edited ${order.id} (${order.customer})`));
      return order;
    });
    res.json(presentOrder(order, { financials: financials(req) }));
  });

  r.post('/:id/status', requireRole('admin', 'production'), async (req, res) => {
    const { status } = parse(statusChange, req.body);
    const order = await store.tx(async (t) => {
      const order = await lockOrder(t, String(req.params.id));
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
      await t.emit(eventFor(req, 'order.updated', order.id, `moved ${order.id} to ${status}`));
      return order;
    });
    res.json(presentOrder(order, { financials: financials(req) }));
  });

  return r;
}
