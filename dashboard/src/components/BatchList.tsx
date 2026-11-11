import { Batch, NOW } from '../data';
import { clock } from '../format';

const ROAST_NAMES = ['', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];

function stateOf(b: Batch) {
  if (b.start + b.duration <= NOW.minutes) return { key: 'done', label: 'Roasted' };
  if (b.start <= NOW.minutes) return { key: 'running', label: 'In the drum' };
  return { key: 'upcoming', label: 'Scheduled' };
}

/** Full list of today's batches, used on the Roasting page. */
export function BatchList({ batches }: { batches: Batch[] }) {
  const sorted = [...batches].sort((a, b) => a.start - b.start);
  const byRoaster = (r: Batch['roaster']) => batches.filter((b) => b.roaster === r).reduce((s, b) => s + b.kg, 0);

  return (
    <section className="panel" aria-labelledby="batches-title">
      <div className="section-head">
        <div>
          <h2 id="batches-title">Batches today</h2>
          <p className="muted small">
            Probat P12: {byRoaster('Probat P12')} kg. Loring S15: {byRoaster('Loring S15')} kg.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table table-static">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Coffee</th>
              <th scope="col">Roaster</th>
              <th scope="col">Roast</th>
              <th scope="col" className="num">Kg green</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const s = stateOf(b);
              return (
                <tr key={b.id}>
                  <td className="nowrap">
                    {clock(b.start)}–{clock(b.start + b.duration)}
                  </td>
                  <td>{b.coffee}</td>
                  <td className="nowrap">{b.roaster}</td>
                  <td className="nowrap">
                    <span className="roast-cell">
                      <span className={`swatch roast-${b.roast}`} />
                      {ROAST_NAMES[b.roast]}
                    </span>
                  </td>
                  <td className="num">{b.kg}</td>
                  <td>
                    <span className={`state state-${s.key}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
