import { createApp } from './app.js';
import { createStore } from './store/index.js';

const port = Number(process.env.PORT ?? 3000);
const store = await createStore();
const server = createApp(store).listen(port, () => {
  const db = process.env.DATABASE_URL ? 'PostgreSQL' : 'in-memory store';
  console.log(`Roastline API on http://localhost:${port}  (docs: /docs, data: ${db})`);
});

// Let in-flight requests finish and close the pool on shutdown (Docker, Render).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => store.close().finally(() => process.exit(0)));
  });
}
