import { useMemo, useState } from 'react';
import { Order, OrderStatus, orderKg } from '../data';
import { dueLabel, isDueToday, usd } from '../format';

type SortKey = 'priority' | 'due' | 'customer' | 'kg' | 'total';
const FILTERS: ('All' | OrderStatus)[] = ['All', 'New', 'Roasting', 'Packed', 'Shipped'];

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export function OrdersTable({
  orders,
  query,
  onOpen,
  onNew,
  pageSize = 8,
}: {
  orders: Order[];
  query: string;
  onOpen: (o: Order) => void;
  /** Shown as a "New order" button when the user may create orders. */
  onNew?: () => void;
  pageSize?: number;
}) {
  const PAGE_SIZE = pageSize;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  // Default order: open orders first by due date, shipped orders last (newest first).
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 });
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: orders.length };
    orders.forEach((o) => (c[o.status] = (c[o.status] ?? 0) + 1));
    return c;
  }, [orders]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = orders.filter(
      (o) =>
        (filter === 'All' || o.status === filter) &&
        (!q ||
          o.customer.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.city.toLowerCase().includes(q) ||
          o.lines.some((l) => l.coffee.toLowerCase().includes(q))),
    );
    const val = (o: Order) =>
      sort.key === 'kg' ? orderKg(o) : sort.key === 'total' ? o.total : sort.key === 'customer' ? o.customer : o.due;
    if (sort.key === 'priority') {
      return [...list].sort((a, b) => {
        const sa = a.status === 'Shipped' ? 1 : 0;
        const sb = b.status === 'Shipped' ? 1 : 0;
        if (sa !== sb) return sa - sb;
        const d = sa ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due);
        return d || a.id.localeCompare(b.id);
      });
    }
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * sort.dir;
    });
  }, [orders, filter, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const sortBy = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));

  const header = (key: SortKey, label: string, align?: 'num') => (
    <th
      scope="col"
      className={align}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="sort" onClick={() => sortBy(key)}>
        {label}
        <span className="sort-mark" aria-hidden="true">
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );

  return (
    <section className="orders" aria-labelledby="orders-title">
      <div className="section-head">
        <div className="title-with-action">
          <h2 id="orders-title">Wholesale orders</h2>
          {onNew && (
            <button type="button" className="btn-primary btn-sm" onClick={onNew}>
              + New order
            </button>
          )}
        </div>
        <div className="tabs" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={filter === f}
              className={filter === f ? 'tab is-active' : 'tab'}
              onClick={() => {
                setFilter(f);
                setPage(0);
              }}
            >
              {f} <span className="tab-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <p>No orders match “{query}”.</p>
          <p className="muted">Try a café name, a city or a coffee.</p>
        </div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                {header('customer', 'Customer')}
                <th scope="col">Coffee</th>
                {header('kg', 'Kg', 'num')}
                {header('due', 'Due')}
                <th scope="col">Status</th>
                {header('total', 'Total', 'num')}
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} onClick={() => onOpen(o)}>
                  <td>
                    <button type="button" className="row-link" onClick={(e) => { e.stopPropagation(); onOpen(o); }}>
                      {o.id}
                    </button>
                  </td>
                  <td>
                    <div className="cust">{o.customer}</div>
                    <div className="muted small">{o.city}</div>
                  </td>
                  <td className="coffee-cell">
                    {o.lines[0].coffee}
                    {o.lines.length > 1 && <span className="muted"> +{o.lines.length - 1} more</span>}
                  </td>
                  <td className="num">{orderKg(o)}</td>
                  <td className={isDueToday(o.due) && o.status !== 'Shipped' && o.status !== 'Packed' ? 'due-soon' : ''}>
                    {dueLabel(o.due)}
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num">{usd(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="order-cards">
            {visible.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => onOpen(o)}>
                  <span className="oc-top">
                    <strong>{o.customer}</strong>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="muted small">
                    {o.id}, {o.city}
                  </span>
                  <span className="oc-bottom">
                    <span>{orderKg(o)} kg</span>
                    <span className={isDueToday(o.due) && (o.status === 'New' || o.status === 'Roasting') ? 'due-soon' : ''}>
                      Due {dueLabel(o.due).toLowerCase()}
                    </span>
                    <span className="num">{usd(o.total)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="pager">
        <span className="muted small">
          {rows.length === 0 ? 0 : current * PAGE_SIZE + 1}–{Math.min(rows.length, (current + 1) * PAGE_SIZE)} of {rows.length}
        </span>
        <div>
          <button type="button" className="btn-ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          <button type="button" className="btn-ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
