import { MemoryStore } from './memory.js';
import { PgStore } from './postgres.js';
import type { Store } from './types.js';

export type { Store, Tx } from './types.js';
export { MemoryStore, PgStore };

/** PostgreSQL when DATABASE_URL is set, otherwise an in-memory store with the demo data. */
export async function createStore(databaseUrl = process.env.DATABASE_URL): Promise<Store> {
  return databaseUrl ? PgStore.connect(databaseUrl) : new MemoryStore();
}
