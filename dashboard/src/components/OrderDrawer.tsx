import { useEffect, useRef } from 'react';
import { Order, OrderStatus, orderKg } from '../data';
import { dueLabel, usd } from '../format';
import { StatusBadge } from './OrdersTable';

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  New: { to: 'Roasting', label: 'Start roasting' },
  Roasting: { to: 'Packed', label: 'Mark as packed' },
  Packed: { to: 'Shipped', label: 'Mark as shipped' },
};

const FLOW: OrderStatus[] = ['New', 'Roasting', 'Packed', 'Shipped'];

export function OrderDrawer({
  order,
  onClose,
  onAdvance,
  busy = false,
  canAdvance = true,
  onEdit,
}: {
  order: Order | null;
  onClose: () => void;
  onAdvance: (o: Order, to: OrderStatus) => void;
  busy?: boolean;
  canAdvance?: boolean;
  /** Shown as an "Edit" button for New orders when the user may edit them. */
  onEdit?: (o: Order) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!order) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order, onClose]);

  if (!order) return null;
  const next = NEXT[order.status];
  const step = FLOW.indexOf(order.status);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <p className="muted small">{order.id}</p>
            <h2 id="drawer-title">{order.customer}</h2>
            <p className="muted">{order.city}, due {dueLabel(order.due).toLowerCase()}</p>
          </div>
          <div className="head-actions">
            {onEdit && order.status === 'New' && (
              <button type="button" className="btn-ghost" onClick={() => onEdit(order)}>
                Edit
              </button>
            )}
            <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close order details">
              ✕
            </button>
          </div>
        </header>

        <ol className="flow" aria-label="Order progress">
          {FLOW.map((s, i) => (
            <li key={s} className={i < step ? 'past' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
              {s}
            </li>
          ))}
        </ol>

        <table className="lines">
          <thead>
            <tr>
              <th scope="col">Coffee</th>
              <th scope="col">Grind</th>
              <th scope="col" className="num">Kg</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.coffee + l.grind}>
                <td>{l.coffee}</td>
                <td>{l.grind}</td>
                <td className="num">{l.kg}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total, {orderKg(order)} kg</td>
              <td className="num">{usd(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.note && (
          <div className="note">
            <strong>Delivery note</strong>
            <p>{order.note}</p>
          </div>
        )}

        <footer className="drawer-foot">
          <StatusBadge status={order.status} />
          {next && !canAdvance ? (
            <span className="muted small">View only: your role can't change orders.</span>
          ) : next ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => onAdvance(order, next.to)}>
              {busy ? 'Saving…' : next.label}
            </button>
          ) : (
            <span className="muted">This order has shipped.</span>
          )}
        </footer>
      </aside>
    </div>
  );
}
