# Roastline — roastery operations dashboard

A portfolio project: an admin dashboard for a small specialty coffee roaster that sells wholesale to cafés.

**Stack:** React 18, TypeScript, Vite, Recharts, plain CSS with design tokens (light and dark themes).

## Pages
The sidebar switches between five pages, each with its own address (`#overview`, `#orders`, `#roasting`, `#inventory`, `#customers`), so the browser Back button and shared links work.
- **Overview:** KPIs, roast schedule, orders, stock and shipments at a glance.
- **Orders:** the full orders table, 15 per page.
- **Roasting:** the schedule timeline plus a table of every batch today.
- **Inventory:** stock meters, shipments chart, and a stock table with days of cover.
- **Customers:** wholesale customers with order count, open orders, kg and revenue; sortable and searchable.

## Features
- **KPI strip:** kg leaving today, new orders, revenue booked this week, green coffee below reorder point.
- **Roast schedule timeline:** today's batches on two roasters from 06:00 to 18:00, shaded by roast level, with a live "now" marker. Click a batch for details. On phones the timeline opens centred on the current time.
- **Wholesale orders table:** search (café, city, order ID, coffee), status filter tabs with counts, sortable columns, pagination. Turns into a card list on mobile.
- **Order detail drawer:** order lines, delivery note, progress steps, and an action that moves the order to its next status (New → Roasting → Packed → Shipped) with a confirmation toast. Closes with Esc.
- **Green coffee stock:** meters with reorder-point markers; low stock is flagged.
- **Kg shipped by origin:** stacked bar chart for the last six weeks.
- Dark mode toggle (remembered per browser), keyboard focus states, reduced-motion support, accessible labels.

Data comes from the [Roastline API](../api) (`src/api.ts`): orders, roast batches, green stock and the weekly shipping report are loaded on start, and moving an order to its next status is a `POST /orders/{id}/status` call, so the server enforces the workflow. The demo clock is fixed at 10:40 so screenshots stay consistent. `src/data.ts` keeps the dashboard's types and a reference copy of the sample data.

## Run it
Start the API first (`cd ../api && npm run dev`, port 3000). In development Vite proxies `/api` to it.
```bash
npm install
npm run dev      # development server
npm run build    # production build in dist/
SINGLE=1 npx vite build --outDir dist-single   # one self-contained HTML file
```

Environment variables (see `.env.example`):

| Name | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | API base URL. Set it for production builds, e.g. `https://your-api.onrender.com/api/v1` |
| `VITE_API_KEY` | `demo-key` | Sent as `X-API-Key` on writes. It ends up in the browser bundle, so use a demo key only |
| `API_PROXY_TARGET` | `http://localhost:3000` | Where the dev server proxies `/api` |

## Deploy (free) on Netlify

The repository root includes a [`netlify.toml`](../netlify.toml) that builds this folder (`base = "dashboard"`).

1. Deploy the API first and note its URL.
2. On [netlify.com](https://netlify.com): **Add new site > Import an existing project**, pick this repository.
3. Under **Environment variables** set `VITE_API_URL` to `https://<your-api>.onrender.com/api/v1` (and `VITE_API_KEY` if the API doesn't use `demo-key`), then deploy.
4. Set `CORS_ORIGIN` on the API to the Netlify URL.

## Structure
```
src/
  App.tsx                 layout, KPIs, theme, toast
  api.ts                  API client; maps API responses onto the dashboard's types
  data.ts                 types, plus a reference copy of the sample data
  format.ts               date / currency helpers
  components/
    RoastSchedule.tsx     timeline
    OrdersTable.tsx       table, filters, sorting, pagination, mobile cards
    OrderDrawer.tsx       order detail + status action
    GreenStock.tsx        stock meters
    ShippedChart.tsx      Recharts stacked bar chart
    BatchList.tsx         Roasting page batch table
    InventoryTable.tsx    Inventory page stock table
    CustomersTable.tsx    Customers page table
  index.css               design tokens and all styles
```
