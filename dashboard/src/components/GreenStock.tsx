import { GreenStock as Stock } from '../data';

export function GreenStock({ stock }: { stock: Stock[] }) {
  const sorted = [...stock].sort((a, b) => a.kg / a.reorderAt - b.kg / b.reorderAt);
  const low = stock.filter((s) => s.kg < s.reorderAt).length;

  return (
    <section className="stock" aria-labelledby="stock-title">
      <div className="section-head">
        <h2 id="stock-title">Green coffee</h2>
        {low > 0 && <span className="alert-pill">{low} to reorder</span>}
      </div>
      <ul className="stock-list">
        {sorted.map((s) => {
          const isLow = s.kg < s.reorderAt;
          return (
            <li key={s.coffee} className={isLow ? 'is-low' : ''}>
              <div className="stock-row">
                <span>{s.coffee}</span>
                <span className="num">{s.kg} kg</span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={s.capacity}
                aria-valuenow={s.kg}
                aria-label={`${s.coffee} stock`}
              >
                <span className="meter-fill" style={{ width: `${Math.min(100, (s.kg / s.capacity) * 100)}%` }} />
                <span className="meter-mark" style={{ left: `${(s.reorderAt / s.capacity) * 100}%` }} title={`Reorder at ${s.reorderAt} kg`} />
              </div>
              {isLow && <p className="small low-text">Below the {s.reorderAt} kg reorder point</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
