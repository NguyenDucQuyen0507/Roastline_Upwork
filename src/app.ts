import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { Store } from './store.js';
import { errorHandler, notFound, requireApiKey } from './http.js';
import { ordersRouter } from './routes/orders.js';
import { batchesRouter } from './routes/batches.js';
import { coffeesRouter, customersRouter, inventoryRouter, reportsRouter } from './routes/misc.js';

const specPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
export const openapi = parseYaml(readFileSync(specPath, 'utf8'));

export function createApp(store = new Store()) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req, res) => res.redirect('/docs'));
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Roastline API' }));

  const api = express.Router();
  api.use(requireApiKey);
  api.get('/health', (_req, res) => res.json({ status: 'ok' }));
  api.use('/coffees', coffeesRouter());
  api.use('/orders', ordersRouter(store));
  api.use('/batches', batchesRouter(store));
  api.use('/inventory', inventoryRouter(store));
  api.use('/customers', customersRouter(store));
  api.use('/reports', reportsRouter());
  api.use((req) => {
    throw notFound(`Route ${req.method} ${req.originalUrl}`);
  });

  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}
