import pg from 'pg';
import type { Batch, CoffeeId, Order, StockRecord } from '../domain.js';
import { coffees, seedBatches, seedOrders, seedStock } from '../seed.js';
import { migrate } from '../db/migrate.js';
import type { Store, Tx } from './types.js';

// Return numeric columns as numbers and DATE columns as 'YYYY-MM-DD' strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

type Queryable = Pick<pg.PoolClient, 'query'>;

const ORDER_SELECT = `
  SELECT o.id, o.customer, o.city, o.due, o.status, o.note,
         COALESCE(json_agg(json_build_object('coffeeId', l.coffee_id, 'kg', l.kg, 'grind', l.grind)
                  ORDER BY l.line_no) FILTER (WHERE l.order_id IS NOT NULL), '[]') AS lines
  FROM orders o LEFT JOIN order_lines l ON l.order_id = o.id`;

const BATCH_SELECT = `
  SELECT b.id, b.coffee_id, b.roaster, b.start_min, b.duration_min, b.kg, b.roast_level,
         COALESCE(json_agg(json_build_object('coffeeId', g.coffee_id, 'kg', g.kg))
                  FILTER (WHERE g.batch_id IS NOT NULL), '[]') AS green_use
  FROM batches b LEFT JOIN batch_green_use g ON g.batch_id = b.id`;

interface OrderRow { id: string; customer: string; city: string; due: string; status: Order['status']; note: string | null; lines: Order['lines'] }
interface BatchRow { id: string; coffee_id: CoffeeId; roaster: Batch['roaster']; start_min: number; duration_min: number; kg: number; roast_level: Batch['roastLevel']; green_use: Batch['greenUse'] }
interface StockRow { coffee_id: CoffeeId; kg: number; reorder_at: number; capacity: number }

const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  customer: r.customer,
  city: r.city,
  due: r.due,
  status: r.status,
  lines: r.lines.map((l) => ({ ...l, kg: Number(l.kg) })),
  ...(r.note !== null && { note: r.note }),
});

const toBatch = (r: BatchRow): Batch => ({
  id: r.id,
  coffeeId: r.coffee_id,
  roaster: r.roaster,
  startMin: r.start_min,
  durationMin: r.duration_min,
  kg: r.kg,
  roastLevel: r.roast_level,
  greenUse: r.green_use.map((g) => ({ ...g, kg: Number(g.kg) })),
});

const toStock = (r: StockRow): StockRecord => ({
  coffeeId: r.coffee_id,
  kg: r.kg,
  reorderAt: r.reorder_at,
  capacity: r.capacity,
});

async function insertOrderRows(db: Queryable, o: Order) {
  await db.query('INSERT INTO orders (id, customer, city, due, status, note) VALUES ($1, $2, $3, $4, $5, $6)', [
    o.id, o.customer, o.city, o.due, o.status, o.note ?? null,
  ]);
  for (const [i, l] of o.lines.entries()) {
    await db.query('INSERT INTO order_lines (order_id, line_no, coffee_id, kg, grind) VALUES ($1, $2, $3, $4, $5)', [
      o.id, i + 1, l.coffeeId, l.kg, l.grind,
    ]);
  }
}

async function insertBatchRows(db: Queryable, b: Batch) {
  await db.query(
    'INSERT INTO batches (id, coffee_id, roaster, start_min, duration_min, kg, roast_level) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [b.id, b.coffeeId, b.roaster, b.startMin, b.durationMin, b.kg, b.roastLevel],
  );
  for (const g of b.greenUse) {
    await db.query('INSERT INTO batch_green_use (batch_id, coffee_id, kg) VALUES ($1, $2, $3)', [b.id, g.coffeeId, g.kg]);
  }
}

function api(db: Queryable): Tx {
  return {
    async listOrders() {
      const { rows } = await db.query<OrderRow>(`${ORDER_SELECT} GROUP BY o.id ORDER BY o.id`);
      return rows.map(toOrder);
    },
    async getOrder(id, opts) {
      // FOR UPDATE can't be combined with GROUP BY, so lock the row first.
      if (opts?.lock) await db.query('SELECT 1 FROM orders WHERE id = $1 FOR UPDATE', [id]);
      const { rows } = await db.query<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 GROUP BY o.id`, [id]);
      return rows[0] && toOrder(rows[0]);
    },
    async insertOrder(data) {
      const { rows } = await db.query<{ id: string }>(`SELECT 'WH-' || nextval('order_no_seq') AS id`);
      const order = { ...data, id: rows[0].id };
      await insertOrderRows(db, order);
      return order;
    },
    async updateOrder(o) {
      await db.query('UPDATE orders SET due = $2, status = $3, note = $4 WHERE id = $1', [o.id, o.due, o.status, o.note ?? null]);
    },

    async listBatches() {
      const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} GROUP BY b.id ORDER BY b.start_min, b.id`);
      return rows.map(toBatch);
    },
    async lockRoaster(roaster) {
      // Transaction-scoped advisory lock: released automatically on COMMIT/ROLLBACK.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`roaster:${roaster}`]);
    },
    async insertBatch(data) {
      const { rows } = await db.query<{ id: string }>(`SELECT 'B-' || nextval('batch_no_seq') AS id`);
      const batch = { ...data, id: rows[0].id };
      await insertBatchRows(db, batch);
      return batch;
    },
    async deleteBatch(id) {
      const { rows } = await db.query<BatchRow>(`${BATCH_SELECT} WHERE b.id = $1 GROUP BY b.id`, [id]);
      if (!rows[0]) return undefined;
      await db.query('DELETE FROM batches WHERE id = $1', [id]);
      return toBatch(rows[0]);
    },

    async listStock() {
      const { rows } = await db.query<StockRow>('SELECT * FROM green_stock ORDER BY coffee_id');
      return rows.map(toStock);
    },
    async getStock(coffeeId, opts) {
      const { rows } = await db.query<StockRow>(
        `SELECT * FROM green_stock WHERE coffee_id = $1${opts?.lock ? ' FOR UPDATE' : ''}`,
        [coffeeId],
      );
      return rows[0] && toStock(rows[0]);
    },
    async setStockKg(coffeeId, kg) {
      await db.query('UPDATE green_stock SET kg = $2 WHERE coffee_id = $1', [coffeeId, kg]);
    },
  };
}

export class PgStore implements Store {
  private constructor(private pool: pg.Pool) {}

  /** Connects, applies pending migrations and seeds an empty database with the demo data. */
  static async connect(connectionString: string, { seedIfEmpty = true } = {}) {
    const pool = new pg.Pool({ connectionString, max: 10 });
    const store = new PgStore(pool);
    await migrate(pool);
    if (seedIfEmpty) {
      const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM coffees');
      if (rows[0].n === 0) await store.reset();
    }
    return store;
  }

  async read<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    return fn(api(this.pool));
  }

  async tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(api(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async reset() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE batch_green_use, batches, order_lines, orders, green_stock, coffees');
      for (const c of coffees) {
        await client.query('INSERT INTO coffees (id, name, origin, price_per_kg, is_blend) VALUES ($1, $2, $3, $4, $5)', [
          c.id, c.name, c.origin, c.pricePerKg, c.isBlend,
        ]);
      }
      for (const s of seedStock()) {
        await client.query('INSERT INTO green_stock (coffee_id, kg, reorder_at, capacity) VALUES ($1, $2, $3, $4)', [
          s.coffeeId, s.kg, s.reorderAt, s.capacity,
        ]);
      }
      const orders = seedOrders();
      for (const o of orders) await insertOrderRows(client, o);
      const batches = seedBatches();
      for (const b of batches) await insertBatchRows(client, b);
      // Continue numbering after the seed ids.
      await client.query('SELECT setval($1, $2, false)', ['order_no_seq', Math.max(...orders.map((o) => Number(o.id.slice(3)))) + 1]);
      await client.query('SELECT setval($1, $2, false)', ['batch_no_seq', Math.max(...batches.map((b) => Number(b.id.slice(2)))) + 1]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
