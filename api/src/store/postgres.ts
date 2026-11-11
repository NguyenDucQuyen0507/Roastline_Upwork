import pg from 'pg';
import type { Batch, CoffeeId, Order, RefreshTokenRecord, StockRecord, User } from '../domain.js';
import { coffees, seedBatches, seedOrders, seedStock, seedUsers } from '../seed.js';
import { migrate } from '../db/migrate.js';
import type { AppEvent, Listener } from '../events.js';
import type { Store, Tx } from './types.js';

const CHANNEL = 'roastline_events';

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
interface UserRow { id: string; email: string; name: string; role: User['role']; password_hash: string }
interface TokenRow { id: string; user_id: string; family_id: string; token_hash: string; expires_at: Date; revoked_at: Date | null }

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash });
const toToken = (r: TokenRow): RefreshTokenRecord => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  tokenHash: r.token_hash,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
});

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

/** `events` collects emit() calls in a transaction, so they can be delivered locally after COMMIT. */
function api(db: Queryable, events?: AppEvent[]): Tx {
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

    async findUserByEmail(email) {
      const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
      return rows[0] && toUser(rows[0]);
    },
    async getUser(id) {
      const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0] && toUser(rows[0]);
    },

    async insertRefreshToken(t) {
      await db.query('INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [
        t.userId, t.familyId, t.tokenHash, t.expiresAt,
      ]);
    },
    async findRefreshToken(hash, opts) {
      const { rows } = await db.query<TokenRow>(
        `SELECT * FROM refresh_tokens WHERE token_hash = $1${opts?.lock ? ' FOR UPDATE' : ''}`,
        [hash],
      );
      return rows[0] && toToken(rows[0]);
    },
    async revokeRefreshToken(id) {
      await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
    },
    async revokeTokenFamily(familyId) {
      await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [familyId]);
    },

    async emit(event) {
      events?.push(event);
      // For other API instances. NOTIFY inside a transaction is delivered on COMMIT and dropped on ROLLBACK.
      await db.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)]);
    },
  };
}

export class PgStore implements Store {
  private listeners = new Set<Listener>();
  private listener?: pg.Client;
  private keepAlive?: ReturnType<typeof setInterval>;
  private closed = false;
  /** Ids of events already delivered locally, so their NOTIFY echo is skipped. */
  private delivered = new Map<string, number>();

  private constructor(
    private pool: pg.Pool,
    private connectionString: string,
  ) {}

  /**
   * Delivery has two paths. Events from this process go straight to its
   * subscribers after COMMIT, so they never depend on LISTEN working.
   * Events from other API instances arrive through LISTEN/NOTIFY; the id check
   * drops the echo of our own events.
   */
  private deliver(event: AppEvent) {
    const now = Date.now();
    if (this.delivered.has(event.eid)) return;
    this.delivered.set(event.eid, now);
    for (const [eid, at] of this.delivered) if (now - at > 60_000) this.delivered.delete(eid);
    for (const l of this.listeners) l(event);
  }

  /**
   * One dedicated connection LISTENs for changes from other API instances.
   * It reconnects when the connection errors or ends (Neon, for example, closes
   * connections when it suspends an idle database), and a periodic query
   * notices a connection that died silently.
   */
  private async listen() {
    if (this.closed) return;
    if (/-pooler\./.test(this.connectionString)) {
      console.warn('DATABASE_URL uses a pooled connection; LISTEN/NOTIFY needs a direct one, so changes from other instances won\'t arrive.');
    }
    const client = new pg.Client({ connectionString: this.connectionString, keepAlive: true });
    let retrying = false;
    const retry = (why: string) => {
      if (retrying) return;
      retrying = true;
      clearInterval(this.keepAlive);
      client.removeAllListeners();
      client.on('error', () => {});
      client.end().catch(() => {});
      if (this.listener === client) this.listener = undefined;
      if (!this.closed) {
        console.warn(`Event listener disconnected (${why}); reconnecting.`);
        setTimeout(() => this.listen().catch(() => {}), 2000).unref();
      }
    };
    client.on('error', (e) => retry(e.message));
    client.on('end', () => retry('connection ended'));
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        this.deliver(JSON.parse(msg.payload));
      } catch {
        /* ignore a malformed payload */
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.listener = client;
      this.keepAlive = setInterval(() => {
        client.query('SELECT 1').catch((e) => retry(e.message));
      }, 60_000);
      this.keepAlive.unref();
    } catch (e) {
      retry((e as Error).message);
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Connects, applies pending migrations and seeds an empty database with the demo data. */
  static async connect(connectionString: string, { seedIfEmpty = true } = {}) {
    const pool = new pg.Pool({ connectionString, max: 10 });
    const store = new PgStore(pool, connectionString);
    await migrate(pool);
    if (seedIfEmpty) {
      const { rows } = await pool.query<{ coffees: number; users: number }>(
        'SELECT (SELECT count(*) FROM coffees)::int AS coffees, (SELECT count(*) FROM users)::int AS users',
      );
      if (rows[0].coffees === 0) await store.reset();
      // A database created before sign-in existed: add the demo accounts, keep the data.
      else if (rows[0].users === 0) {
        for (const u of await seedUsers()) {
          await pool.query(
            'INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [u.id, u.email, u.name, u.role, u.passwordHash],
          );
        }
      }
    }
    await store.listen();
    return store;
  }

  async read<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    return fn(api(this.pool));
  }

  async tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const events: AppEvent[] = [];
      const result = await fn(api(client, events));
      await client.query('COMMIT');
      for (const e of events) this.deliver(e);
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
      const users = await seedUsers();
      await client.query(
        'TRUNCATE refresh_tokens, users, batch_green_use, batches, order_lines, orders, green_stock, coffees',
      );
      for (const u of users) {
        await client.query('INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)', [
          u.id, u.email, u.name, u.role, u.passwordHash,
        ]);
      }
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
    this.closed = true;
    clearInterval(this.keepAlive);
    const l = this.listener;
    this.listener = undefined;
    await l?.end().catch(() => {});
    await this.pool.end();
  }
}
