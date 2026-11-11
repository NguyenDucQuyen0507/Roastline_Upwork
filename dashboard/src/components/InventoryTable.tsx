import { Batch, GreenStock } from '../data';

/** Detailed stock table for the Inventory page, with days of cover at today's roasting rate. */
export function InventoryTable({
  stock,
  batches,
  onReceive,
}: {
  stock: GreenStock[];
  batches: Batch[];
  /** Shown as a "Receive" button per row when the user may record deliveries. */
  onReceive?: (s: GreenStock) => void;
}) {
  const usedToday = (coffee: string) => batches.filter((b) => b.coffee === coffee).reduce((s, b) => s + b.kg, 0);

  return (
    <section className="panel" aria-labelledby="inventory-title">
      <div className="section-head">
        <div>
          <h2 id="inventory-title">Stock detail</h2>
          <p className="muted small">Days of cover assume roasting continues at today's rate.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table table-static">
          <thead>
            <tr>
              <th scope="col">Coffee</th>
              <th scope="col">Origin</th>
              <th scope="col" className="num">On hand</th>
              <th scope="col" className="num">Reorder at</th>
              <th scope="col" className="num">Roasting today</th>
              <th scope="col" className="num">Days of cover</th>
              <th scope="col">Status</th>
              {onReceive && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => {
              const used = usedToday(s.coffee);
              const cover = used > 0 ? Math.floor(s.kg / used) : null;
              const low = s.kg < s.reorderAt;
              return (
                <tr key={s.coffee}>
                  <td>{s.coffee}</td>
                  <td>{s.origin}</td>
                  <td className={`num ${low ? 'due-soon' : ''}`}>{s.kg} kg</td>
                  <td className="num">{s.reorderAt} kg</td>
                  <td className="num">{used ? `${used} kg` : 'None'}</td>
                  <td className="num">{cover === null ? 'No use today' : `${cover} days`}</td>
                  <td>
                    {low ? <span className="alert-pill">Reorder</span> : <span className="state state-upcoming">In stock</span>}
                  </td>
                  {onReceive && (
                    <td className="row-actions">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => onReceive(s)} aria-label={`Receive ${s.coffee}`}>
                        Receive
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
