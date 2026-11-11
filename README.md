# Roastline

[![CI](https://github.com/NguyenDucQuyen0507/Roastline_Upwork/actions/workflows/ci.yml/badge.svg)](https://github.com/NguyenDucQuyen0507/Roastline_Upwork/actions/workflows/ci.yml)

A full-stack operations tool for a small wholesale coffee roaster: orders, the daily roast schedule, green coffee inventory, customers and shipping reports.

- **[`api/`](api)**: REST API in Node.js, Express 5, TypeScript and PostgreSQL, documented with OpenAPI 3 and Swagger UI.
- **[`dashboard/`](dashboard)**: React 18 and TypeScript admin dashboard (Vite, Recharts) that runs on the API.

<!-- After deploying, add the live links here:
**Live demo:** [Dashboard](https://...netlify.app) · [API docs (Swagger UI)](https://...onrender.com/docs)
-->

![Roastline dashboard](docs/dashboard-overview.png)

## Highlights

- **Business rules on the server.** Order totals are calculated from the catalog, orders move one status at a time (`New → Roasting → Packed → Shipped`), and a roast batch is refused if it overlaps another batch, exceeds the roaster's capacity or needs more green coffee than is in stock. Each rule has its own error code (`409 SCHEDULE_CONFLICT`, `409 INSUFFICIENT_GREEN_STOCK`, ...).
- **JWT sign-in with roles** (admin, production, viewer): rotating refresh tokens with reuse detection, scrypt password hashes, role checks on every write. The dashboard has one-click demo accounts.
- **Forms that surface server rules.** Creating orders, scheduling roasts and receiving coffee show the API's validation and business errors next to the right field (e.g. *"Probat P12 is busy from 10:15 to 11:10"* under the start time).
- **Safe under concurrent use.** Writes run in PostgreSQL transactions with row locks and a per-roaster advisory lock. Tests fire parallel requests to prove a slot can't be double-booked and stock updates aren't lost.
- **Design-first API.** The OpenAPI spec was written before the code and is served as interactive docs at `/docs`.
- **One error shape everywhere** (`{ error: { code, message, details } }`), which the dashboard shows to the user.
- **Tested.** 35 API tests run against both the PostgreSQL and the in-memory store. CI on every push: typecheck, tests on a PostgreSQL service container, lint, builds and the Docker image.
- **Polished UI.** Light and dark themes, mobile layouts, keyboard and screen-reader support.

![409 conflict in Swagger UI](api/screenshots/2-batch-conflict-409.png)

## Architecture

```
Browser ── React dashboard (Netlify)
              │  fetch /api/v1/...  (Bearer JWT, refresh token rotation)
              ▼
           Express API (Render) ── Zod validation ── business rules
              │  transactions, row locks
              ▼
           PostgreSQL (Neon)
```

## Run it locally

Requires Node 20+ and Docker.

```bash
# 1. API + PostgreSQL
cd api
npm install
npm run db:up                                   # PostgreSQL in Docker
DATABASE_URL=postgres://roastline:roastline@localhost:5432/roastline npm run dev
#   -> http://localhost:3000/docs

# 2. Dashboard (second terminal)
cd dashboard
npm install
npm run dev                                     # -> http://localhost:5173
```

No Docker? Run `npm run dev` in `api/` without `DATABASE_URL` and it uses an in-memory store with the same demo data. Or run the API and database with `docker compose up --build` in `api/`.

Tests: `npm test` (in-memory) or `npm run test:pg` (in-memory and PostgreSQL) in `api/`.

## Deploy

- **API:** [Render Blueprint](render.yaml) (New > Blueprint, pick this repository). Set `DATABASE_URL` (e.g. a free [Neon](https://neon.tech) database) and `CORS_ORIGIN` (the dashboard URL).
- **Dashboard:** [Netlify](netlify.toml) (Import from Git, pick this repository). Set `VITE_API_URL` to `https://<api>.onrender.com/api/v1`.

The demo database is reset to the seed data every night by a [GitHub Actions workflow](.github/workflows/demo-reset.yml) (needs the repository secret `DEMO_DATABASE_URL`). It can also be run by hand from the Actions tab.

Details: [api/README.md](api/README.md#deploy-free-on-render) and [dashboard/README.md](dashboard/README.md#deploy-free-on-netlify).

## Repository layout

```
api/             REST API (see api/README.md)
dashboard/       React dashboard (see dashboard/README.md)
docs/            Screenshots for this README
.github/         CI and nightly demo reset workflows
render.yaml      Render Blueprint for the API
netlify.toml     Netlify build for the dashboard
```
