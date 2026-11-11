import { randomUUID } from 'node:crypto';
import type { Batch, Order, RefreshTokenRecord, StockRecord, User } from '../domain.js';
import { seedBatches, seedOrders, seedStock, seedUsers } from '../seed.js';
import type { Store, Tx } from './types.js';

interface State {
  orders: Order[];
  batches: Batch[];
  stock: StockRecord[];
  users: User[];
  refreshTokens: RefreshTokenRecord[];
  nextOrderNo: number;
  nextBatchNo: number;
}

const seedState = async (): Promise<State> => {
  const orders = seedOrders();
  const batches = seedBatches();
  return {
    orders,
    batches,
    stock: seedStock(),
    users: await seedUsers(),
    refreshTokens: [],
    nextOrderNo: Math.max(...orders.map((o) => Number(o.id.slice(3)))) + 1,
    nextBatchNo: Math.max(...batches.map((b) => Number(b.id.slice(2)))) + 1,
  };
};

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory store, used when DATABASE_URL is not set and in fast tests.
 * Transactions run one at a time; a failed one restores the state it started from.
 */
export class MemoryStore implements Store {
  private state!: State;
  private queue: Promise<unknown>;

  constructor() {
    // Seeding hashes passwords (async); every call waits for it through the queue.
    this.queue = seedState().then((s) => {
      this.state = s;
    });
  }

  private api(): Tx {
    const s = this.state;
    return {
      listOrders: async () => clone([...s.orders].sort((a, b) => a.id.localeCompare(b.id))),
      getOrder: async (id) => clone(s.orders.find((o) => o.id === id)),
      insertOrder: async (data) => {
        const order = { id: `WH-${s.nextOrderNo++}`, ...clone(data) };
        s.orders.push(order);
        return clone(order);
      },
      updateOrder: async (order) => {
        const o = s.orders.find((x) => x.id === order.id)!;
        o.due = order.due;
        o.status = order.status;
        o.note = order.note;
      },

      listBatches: async () => clone([...s.batches].sort((a, b) => a.startMin - b.startMin)),
      lockRoaster: async () => {},
      insertBatch: async (data) => {
        const batch = { id: `B-${s.nextBatchNo++}`, ...clone(data) };
        s.batches.push(batch);
        return clone(batch);
      },
      deleteBatch: async (id) => {
        const i = s.batches.findIndex((b) => b.id === id);
        return i === -1 ? undefined : s.batches.splice(i, 1)[0];
      },

      listStock: async () => clone(s.stock),
      getStock: async (coffeeId) => clone(s.stock.find((x) => x.coffeeId === coffeeId)),
      setStockKg: async (coffeeId, kg) => {
        s.stock.find((x) => x.coffeeId === coffeeId)!.kg = kg;
      },

      findUserByEmail: async (email) => clone(s.users.find((u) => u.email.toLowerCase() === email.toLowerCase())),
      getUser: async (id) => clone(s.users.find((u) => u.id === id)),

      insertRefreshToken: async (t) => {
        s.refreshTokens.push({ ...t, id: randomUUID(), revokedAt: null });
      },
      findRefreshToken: async (hash) => clone(s.refreshTokens.find((t) => t.tokenHash === hash)),
      revokeRefreshToken: async (id) => {
        const t = s.refreshTokens.find((x) => x.id === id);
        if (t && !t.revokedAt) t.revokedAt = new Date();
      },
      revokeTokenFamily: async (familyId) => {
        for (const t of s.refreshTokens) if (t.familyId === familyId && !t.revokedAt) t.revokedAt = new Date();
      },
    };
  }

  async read<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    await this.queue;
    return fn(this.api());
  }

  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
    const run = async () => {
      const before = clone(this.state);
      try {
        return await fn(this.api());
      } catch (e) {
        this.state = before;
        throw e;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  async reset() {
    const fresh = await seedState();
    await this.tx(async () => {
      this.state = fresh;
    });
  }

  async close() {}
}
