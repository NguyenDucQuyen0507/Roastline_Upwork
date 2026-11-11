import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MemoryStore, PgStore, type Store } from '../src/store/index.js';

const KEY = { 'X-API-Key': 'demo-key' };

/**
 * Every test runs against the in-memory store, and also against PostgreSQL
 * when TEST_DATABASE_URL is set (e.g. `docker compose up -d db` and
 * TEST_DATABASE_URL=postgres://roastline:roastline@localhost:5432/roastline_test).
 */
const backends: { name: string; make: () => Promise<Store> }[] = [
  { name: 'memory', make: async () => new MemoryStore() },
  ...(process.env.TEST_DATABASE_URL
    ? [{ name: 'postgres', make: () => PgStore.connect(process.env.TEST_DATABASE_URL!) }]
    : []),
];

describe.each(backends)('$name store', ({ make }) => {
  let store: Store;
  let app: ReturnType<typeof createApp>;
  const stockKg = async () => Object.fromEntries((await store.read((t) => t.listStock())).map((s) => [s.coffeeId, s.kg]));

  beforeAll(async () => {
    store = await make();
    app = createApp(store);
  });
  beforeEach(() => store.reset());
  afterAll(() => store.close());

  describe('system', () => {
    it('reports health', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('serves the OpenAPI spec', async () => {
      const res = await request(app).get('/openapi.json');
      expect(res.body.openapi).toBe('3.0.3');
      expect(Object.keys(res.body.paths)).toContain('/orders/{id}/status');
    });

    it('returns a JSON 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/nope');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('orders', () => {
    it('filters by status, searches and paginates', async () => {
      const res = await request(app).get('/api/v1/orders?status=New,Roasting&q=port&pageSize=2');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2); // WH-2421 Fieldnote (Portland, New) + WH-2426 Bramble (Portland, New)
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((o: { status: string }) => ['New', 'Roasting'].includes(o.status))).toBe(true);
    });

    it('sorts by total descending', async () => {
      const res = await request(app).get('/api/v1/orders?sort=-total&pageSize=100');
      const totals = res.body.data.map((o: { total: number }) => o.total);
      expect(totals).toEqual([...totals].sort((a: number, b: number) => b - a));
    });

    it('rejects an invalid status filter', async () => {
      const res = await request(app).get('/api/v1/orders?status=Lost');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('calculates the total on the server', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set(KEY)
        .send({ customer: 'Test Café', city: 'Seattle', due: '2026-11-09', lines: [{ coffeeId: 'nyeri', kg: 5, grind: 'Filter' }, { coffeeId: 'house', kg: 10, grind: 'Whole bean' }] });
      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/v1/orders/${res.body.id}`);
      expect(res.body.total).toBe(5 * 38 + 10 * 26);
      expect(res.body.status).toBe('New');
      expect(res.body.nextStatus).toBe('Roasting');
    });

    it('ignores a total sent by the client', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set(KEY)
        .send({ customer: 'Sneaky Co', city: 'Bend', due: '2026-11-09', total: 1, lines: [{ coffeeId: 'guji', kg: 2, grind: 'Espresso' }] });
      expect(res.status).toBe(201);
      expect(res.body.total).toBe(68);
    });

    it('returns field-level validation errors', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set(KEY)
        .send({ customer: 'X', city: 'Seattle', due: '2020-01-01', lines: [{ coffeeId: 'robusta', kg: 0, grind: 'Coarse' }] });
      expect(res.status).toBe(400);
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['customer', 'due', 'lines.0.coffeeId', 'lines.0.kg', 'lines.0.grind']));
    });

    it('requires the API key for writes', async () => {
      const res = await request(app).post('/api/v1/orders').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('moves status one step at a time', async () => {
      const ok = await request(app).post('/api/v1/orders/WH-2421/status').set(KEY).send({ status: 'Roasting' });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('Roasting');

      const skip = await request(app).post('/api/v1/orders/WH-2421/status').set(KEY).send({ status: 'Shipped' });
      expect(skip.status).toBe(409);
      expect(skip.body.error).toMatchObject({ code: 'INVALID_TRANSITION', details: { from: 'Roasting', allowed: 'Packed' } });
    });

    it('locks orders that are in production', async () => {
      const res = await request(app).patch('/api/v1/orders/WH-2419').set(KEY).send({ note: 'Change please' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ORDER_LOCKED');
    });

    it('edits a New order', async () => {
      const res = await request(app).patch('/api/v1/orders/WH-2422').set(KEY).send({ due: '2026-11-10', note: 'Ring the bell' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ due: '2026-11-10', note: 'Ring the bell' });
    });

    it('returns 404 for a missing order', async () => {
      const res = await request(app).get('/api/v1/orders/WH-9999');
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Order WH-9999 not found');
    });
  });

  describe('batches', () => {
    it('lists the schedule in start order', async () => {
      const res = await request(app).get('/api/v1/batches?roaster=Loring%20S15');
      const starts = res.body.data.map((b: { start: string }) => b.start);
      expect(starts).toEqual([...starts].sort());
      expect(res.body.data.every((b: { roaster: string }) => b.roaster === 'Loring S15')).toBe(true);
    });

    it('rejects an overlapping batch on the same roaster', async () => {
      const res = await request(app)
        .post('/api/v1/batches')
        .set(KEY)
        .send({ coffeeId: 'cerrado', roaster: 'Probat P12', start: '15:30', durationMin: 45, kg: 10, roastLevel: 3 });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'SCHEDULE_CONFLICT', details: { conflictingBatchId: 'B-12' } });
    });

    it('rejects a batch larger than the roaster', async () => {
      const res = await request(app)
        .post('/api/v1/batches')
        .set(KEY)
        .send({ coffeeId: 'cerrado', roaster: 'Probat P12', start: '17:00', durationMin: 45, kg: 14, roastLevel: 3 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ROASTER_CAPACITY_EXCEEDED');
    });

    it('rejects a batch when green stock is too low, without touching stock', async () => {
      await store.tx((t) => t.setStockKg('nyeri', 5));
      const res = await request(app)
        .post('/api/v1/batches')
        .set(KEY)
        .send({ coffeeId: 'nyeri', roaster: 'Loring S15', start: '17:00', durationMin: 40, kg: 8, roastLevel: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_GREEN_STOCK');
      expect((await stockKg()).nyeri).toBe(5);
    });

    it('takes green coffee for a blend from each origin, and returns it on cancel', async () => {
      const before = await stockKg();
      const res = await request(app)
        .post('/api/v1/batches')
        .set(KEY)
        .send({ coffeeId: 'house', roaster: 'Probat P12', start: '17:00', durationMin: 55, kg: 12, roastLevel: 4 });
      expect(res.status).toBe(201);
      expect(res.body.greenKgUsed).toBeCloseTo(12 / 0.85, 0);

      const after = await stockKg();
      expect(before.cerrado - after.cerrado).toBeCloseTo((12 / 0.85) * 0.6, 0);
      expect(before.huila - after.huila).toBeCloseTo((12 / 0.85) * 0.4, 0);

      const del = await request(app).delete(`/api/v1/batches/${res.body.id}`).set(KEY);
      expect(del.status).toBe(204);
      const restored = await stockKg();
      expect(restored.cerrado).toBeCloseTo(before.cerrado, 1);
      expect(restored.huila).toBeCloseTo(before.huila, 1);
    });

    it('rejects a bad time format', async () => {
      const res = await request(app)
        .post('/api/v1/batches')
        .set(KEY)
        .send({ coffeeId: 'guji', roaster: 'Loring S15', start: '7pm', durationMin: 40, kg: 5, roastLevel: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error.details[0]).toMatchObject({ path: 'start', message: 'Use HH:MM (24-hour)' });
    });
  });

  describe('inventory, customers, reports', () => {
    it('flags low and critical stock, lowest first', async () => {
      const res = await request(app).get('/api/v1/inventory');
      expect(res.body.data[0]).toMatchObject({ coffeeId: 'nyeri', level: 'low' });
      const low = await request(app).get('/api/v1/inventory?level=low');
      expect(low.body.data.map((s: { coffeeId: string }) => s.coffeeId).sort()).toEqual(['guji', 'nyeri']);
    });

    it('records a delivery but refuses to overfill storage', async () => {
      const ok = await request(app).post('/api/v1/inventory/nyeri/receipts').set(KEY).send({ kg: 60, supplierRef: 'PO-1182' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ kg: 96, level: 'ok' });

      const tooMuch = await request(app).post('/api/v1/inventory/nyeri/receipts').set(KEY).send({ kg: 500 });
      expect(tooMuch.status).toBe(422);
      expect(tooMuch.body.error).toMatchObject({ code: 'STORAGE_CAPACITY_EXCEEDED', details: { spaceLeftKg: 104 } });
    });

    it('returns 404 for a coffee with no green stock', async () => {
      const res = await request(app).post('/api/v1/inventory/house/receipts').set(KEY).send({ kg: 10 });
      expect(res.status).toBe(404);
    });

    it('builds customers from orders', async () => {
      const res = await request(app).get('/api/v1/customers?sort=name');
      const lantern = res.body.data.find((c: { name: string }) => c.name === 'Lantern Coffee Bar');
      expect(lantern).toMatchObject({ orderCount: 2, openOrders: 1, lastOrderDue: '2026-11-05' });
    });

    it('returns weekly shipped totals', async () => {
      const res = await request(app).get('/api/v1/reports/shipped-by-week');
      expect(res.body.data).toHaveLength(6);
    });
  });

  describe('concurrent requests', () => {
    it('books a roaster slot only once', async () => {
      const send = () =>
        request(app)
          .post('/api/v1/batches')
          .set(KEY)
          .send({ coffeeId: 'cerrado', roaster: 'Probat P12', start: '17:00', durationMin: 45, kg: 10, roastLevel: 3 });
      const results = await Promise.all(Array.from({ length: 5 }, send));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    });

    it('does not lose stock updates', async () => {
      const before = (await stockKg()).nyeri;
      await Promise.all(
        Array.from({ length: 10 }, () => request(app).post('/api/v1/inventory/nyeri/receipts').set(KEY).send({ kg: 10 })),
      );
      expect((await stockKg()).nyeri).toBe(before + 100);
    });

    it('moves an order forward once when two people click at the same time', async () => {
      const send = () => request(app).post('/api/v1/orders/WH-2421/status').set(KEY).send({ status: 'Roasting' });
      const results = await Promise.all([send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });
});
