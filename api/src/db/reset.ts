/** Resets the database in DATABASE_URL to the demo data: `npm run db:reset`. */
import { PgStore } from '../store/postgres.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const store = await PgStore.connect(url, { seedIfEmpty: false });
await store.reset();
await store.close();
console.log('Database reset to demo data');
