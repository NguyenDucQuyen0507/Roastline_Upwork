import type { Batch, Order, StockRecord } from './domain.js';
import { seedBatches, seedOrders, seedStock } from './seed.js';

/**
 * In-memory data store. Routes only talk to this object, so swapping it for a
 * real database (Postgres, MongoDB...) means changing this file, not the routes.
 */
export class Store {
  orders: Order[] = [];
  batches: Batch[] = [];
  stock: StockRecord[] = [];
  private nextOrderNo = 0;
  private nextBatchNo = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.orders = seedOrders();
    this.batches = seedBatches();
    this.stock = seedStock();
    this.nextOrderNo = Math.max(...this.orders.map((o) => Number(o.id.slice(3)))) + 1;
    this.nextBatchNo = Math.max(...this.batches.map((b) => Number(b.id.slice(2)))) + 1;
  }

  newOrderId() {
    return `WH-${this.nextOrderNo++}`;
  }

  newBatchId() {
    return `B-${this.nextBatchNo++}`;
  }
}
