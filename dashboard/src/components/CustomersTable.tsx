import { useMemo, useState } from 'react';
import { Order, orderKg } from '../data';
import { dueLabel, usd } from '../format';

interface CustomerRow {
  name: string;
  city: string;
  orders: number;
  open: number;
  kg: number;
  revenue: number;
  last: string;
}

type SortKey = 'name' | 'orders' | 'kg' | 'revenue' | 'last';

/** Wholesale customers aggregated from orders, for the Customers page. */
export function CustomersTable({ orders, query }: { orders: Order[]; query: string }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'revenue', dir: -1 });

  const rows = useMemo(() => {
    const map = new Map<string, CustomerRow>();
    for (const o of orders) {
      const r = map.get(o.customer) ?? { name: o.customer, city: o.city, orders: 0, open: 0, kg: 0, revenue: 0, last: o.due };
      r.orders += 1;
      r.open += o.status === 'Shipped' ? 0 : 1;
      r.kg += orderKg(o);
      r.revenue += o.total;
      if (o.due > r.last) r.last = o.due;
      map.set(o.customer, r);
    }
    const q = query.trim().toLowerCase();
    return [...map.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [orders, query, sort]);

  const header = (key: SortKey, label: string, num?: boolean) => (
    <th scope="col" className={num ? 'num' : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="sort"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}
      >
        {label}
        <span className="sort-mark" aria-hidden="true">
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );

  return (
    <section className="panel" aria-labelledby="customers-title">
      <div className="section-head">
        <div>
          <h2 id="customers-title">Wholesale customers</h2>
          <p className="muted small">{rows.length} cafés and businesses</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>No customers match “{query}”.</p>
          <p className="muted">Try a café name or a city.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table table-static">
            <thead>
              <tr>
                {header('name', 'Customer')}
                {header('orders', 'Orders', true)}
                <th scope="col" className="num">Open</th>
                {header('kg', 'Kg', true)}
                {header('revenue', 'Revenue', true)}
                {header('last', 'Latest due')}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>
                    <div className="cust">{r.name}</div>
                    <div className="muted small">{r.city}</div>
                  </td>
                  <td className="num">{r.orders}</td>
                  <td className="num">{r.open || '–'}</td>
                  <td className="num">{r.kg}</td>
                  <td className="num">{usd(r.revenue)}</td>
                  <td className="nowrap">{dueLabel(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
