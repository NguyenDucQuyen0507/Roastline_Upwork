import type { Batch, CoffeeId, Order, Roaster, StockRecord } from '../domain.js';

/**
 * Data access used by the routes. Every call runs inside a unit of work:
 * `store.read()` for queries, `store.tx()` for anything that writes.
 * A failed `tx()` leaves no partial changes behind.
 */
export interface Tx {
  listOrders(): Promise<Order[]>;
  /** `lock: true` holds the row until the transaction ends (SELECT ... FOR UPDATE). */
  getOrder(id: string, opts?: { lock?: boolean }): Promise<Order | undefined>;
  /** Assigns the next order id (WH-nnnn). */
  insertOrder(order: Omit<Order, 'id'>): Promise<Order>;
  /** Saves due, status and note. Lines are fixed once an order exists. */
  updateOrder(order: Order): Promise<void>;

  listBatches(): Promise<Batch[]>;
  /** Serialises scheduling on one roaster so two requests can't book the same slot. */
  lockRoaster(roaster: Roaster): Promise<void>;
  /** Assigns the next batch id (B-n). */
  insertBatch(batch: Omit<Batch, 'id'>): Promise<Batch>;
  /** Removes a batch and returns it, or undefined if it doesn't exist. */
  deleteBatch(id: string): Promise<Batch | undefined>;

  listStock(): Promise<StockRecord[]>;
  getStock(coffeeId: CoffeeId, opts?: { lock?: boolean }): Promise<StockRecord | undefined>;
  setStockKg(coffeeId: CoffeeId, kg: number): Promise<void>;
}

export interface Store {
  read<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
  /** Replace all data with the demo seed. */
  reset(): Promise<void>;
  close(): Promise<void>;
}
