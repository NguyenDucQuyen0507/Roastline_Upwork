import { useEffect, useRef, useState } from 'react';
import { Batch, NOW } from '../data';
import { clock } from '../format';

const DAY_START = 6 * 60;
const DAY_END = 18 * 60;
const SPAN = DAY_END - DAY_START;
const ROASTERS: Batch['roaster'][] = ['Probat P12', 'Loring S15'];
const ROAST_NAMES = ['', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];

const pct = (minutes: number) => ((minutes - DAY_START) / SPAN) * 100;

function stateOf(b: Batch) {
  if (b.start + b.duration <= NOW.minutes) return 'done';
  if (b.start <= NOW.minutes) return 'running';
  return 'upcoming';
}

export function RoastSchedule({ batches }: { batches: Batch[] }) {
  const [selected, setSelected] = useState<Batch | null>(
    batches.find((b) => stateOf(b) === 'running') ?? null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // On narrow screens the timeline scrolls sideways: open it centred on "now".
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const label = 108;
    const x = label + (el.scrollWidth - label) * (pct(NOW.minutes) / 100);
    el.scrollLeft = x - el.clientWidth / 2;
  }, []);

  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);
  const done = batches.filter((b) => stateOf(b) === 'done');
  const kgDone = done.reduce((s, b) => s + b.kg, 0);
  const kgTotal = batches.reduce((s, b) => s + b.kg, 0);

  return (
    <section className="schedule" aria-labelledby="schedule-title">
      <div className="section-head">
        <div>
          <h2 id="schedule-title">Today's roast schedule</h2>
          <p className="muted">
            {done.length} of {batches.length} batches roasted, {kgDone} of {kgTotal} kg
          </p>
        </div>
        <ul className="roast-legend" aria-label="Roast level">
          {[1, 2, 3, 4, 5].map((r) => (
            <li key={r}>
              <span className={`swatch roast-${r}`} />
              {ROAST_NAMES[r]}
            </li>
          ))}
        </ul>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        <div className="timeline">
          <div className="timeline-hours" aria-hidden="true">
            {hours.map((h) => (
              <span key={h} style={{ left: `${pct(h)}%` }}>
                {clock(h)}
              </span>
            ))}
          </div>

          {ROASTERS.map((r) => (
            <div className="lane" key={r}>
              <div className="lane-label">{r}</div>
              <div className="lane-track">
                {hours.map((h) => (
                  <span key={h} className="gridline" style={{ left: `${pct(h)}%` }} aria-hidden="true" />
                ))}
                {batches
                  .filter((b) => b.roaster === r)
                  .map((b) => {
                    const s = stateOf(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`batch roast-${b.roast} ${s} ${selected?.id === b.id ? 'is-selected' : ''}`}
                        style={{ left: `${pct(b.start)}%`, width: `${(b.duration / SPAN) * 100}%` }}
                        onClick={() => setSelected(b)}
                        aria-pressed={selected?.id === b.id}
                        aria-label={`${b.coffee}, ${clock(b.start)}, ${b.kg} kg, ${s}`}
                      >
                        <span className="batch-kg">{b.kg}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}

          <div className="now-line" style={{ left: `calc(var(--lane-label) + (100% - var(--lane-label)) * ${pct(NOW.minutes) / 100})` }}>
            <span>Now {clock(NOW.minutes)}</span>
          </div>
        </div>
      </div>

      <div className="batch-detail" aria-live="polite">
        {selected ? (
          <>
            <span className={`swatch roast-${selected.roast}`} />
            <strong>{selected.coffee}</strong>
            <span>
              {clock(selected.start)}–{clock(selected.start + selected.duration)} on the {selected.roaster}
            </span>
            <span>{selected.kg} kg green, {ROAST_NAMES[selected.roast].toLowerCase()} roast</span>
            <span className={`state state-${stateOf(selected)}`}>
              {{ done: 'Roasted', running: 'In the drum', upcoming: 'Scheduled' }[stateOf(selected)]}
            </span>
          </>
        ) : (
          <span className="muted">Select a batch to see its details.</span>
        )}
      </div>
    </section>
  );
}
