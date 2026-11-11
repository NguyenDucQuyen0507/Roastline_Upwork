import { useState } from 'react';
import { ApiError, createBatch, fieldErrors, type Coffee } from '../api';
import { Batch, NOW } from '../data';
import { clock } from '../format';
import { Field, FormDrawer } from './FormDrawer';

const ROASTERS: { name: Batch['roaster']; capacity: number }[] = [
  { name: 'Probat P12', capacity: 12 },
  { name: 'Loring S15', capacity: 15 },
];
const ROAST_NAMES = ['Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];
/** Roasting loses about 15% of the green coffee's weight (same figure the API uses). */
const ROAST_YIELD = 0.85;

/** First start time after "now" and after the roaster's last batch, rounded up to 5 minutes. */
function nextFreeStart(batches: Batch[], roaster: Batch['roaster']) {
  const lastEnd = Math.max(0, ...batches.filter((b) => b.roaster === roaster).map((b) => b.start + b.duration));
  const t = Math.ceil(Math.max(lastEnd, NOW.minutes) / 5) * 5;
  return clock(Math.min(t, 23 * 60));
}

/**
 * Schedules a roast batch. Business-rule errors from the API are shown on the
 * field they concern: a schedule clash on the start time, capacity and green
 * stock problems on the weight.
 */
export function BatchForm({
  coffees,
  batches,
  onClose,
  onCreated,
}: {
  coffees: Coffee[];
  batches: Batch[];
  onClose: () => void;
  onCreated: (b: Batch) => void;
}) {
  const [roaster, setRoaster] = useState<Batch['roaster']>('Probat P12');
  const [coffeeId, setCoffeeId] = useState(coffees[0]?.id ?? '');
  const [start, setStart] = useState(() => nextFreeStart(batches, 'Probat P12'));
  const [durationMin, setDuration] = useState('45');
  const [kg, setKg] = useState('');
  const [roastLevel, setRoastLevel] = useState(3);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Drop a field's error as soon as the user changes it. */
  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const capacity = ROASTERS.find((r) => r.name === roaster)!.capacity;
  const busySlots = batches
    .filter((b) => b.roaster === roaster)
    .sort((a, b) => a.start - b.start)
    .map((b) => `${clock(b.start)}–${clock(b.start + b.duration)}`);
  const green = Number(kg) > 0 ? Math.round((Number(kg) / ROAST_YIELD) * 10) / 10 : null;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      onCreated(
        await createBatch({ coffeeId, roaster, start, durationMin: Number(durationMin), kg: Number(kg), roastLevel }),
      );
    } catch (e) {
      setBusy(false);
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) return setErrors(fe);
      if (e instanceof ApiError) {
        if (e.code === 'SCHEDULE_CONFLICT') return setErrors({ start: e.message });
        if (e.code === 'ROASTER_CAPACITY_EXCEEDED' || e.code === 'INSUFFICIENT_GREEN_STOCK') return setErrors({ kg: e.message });
        return setFormError(e.message);
      }
      setFormError('Could not schedule the batch');
    }
  };

  return (
    <FormDrawer
      title="Schedule a roast"
      subtitle="The server checks the roaster's schedule, its capacity and green coffee stock."
      submitLabel="Schedule batch"
      busy={busy}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Roaster" error={errors.roaster}>
        <select
          value={roaster}
          onChange={(e) => {
            const r = e.target.value as Batch['roaster'];
            setRoaster(r);
            setStart(nextFreeStart(batches, r));
            setErrors({});
          }}
        >
          {ROASTERS.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name} (up to {r.capacity} kg)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Coffee" error={errors.coffeeId}>
        <select value={coffeeId} onChange={(e) => (setCoffeeId(e.target.value), clear('kg'))}>
          {coffees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="field-row">
        <Field
          label="Start"
          error={errors.start}
          hint={busySlots.length ? `Busy: ${busySlots.join(', ')}` : 'Roaster is free all day'}
        >
          <input type="time" step={300} value={start} onChange={(e) => (setStart(e.target.value), clear('start'))} />
        </Field>
        <Field label="Minutes" error={errors.durationMin} className="narrow">
          <input type="number" min={20} max={120} step={5} value={durationMin} onChange={(e) => (setDuration(e.target.value), clear('durationMin'), clear('start'))} />
        </Field>
      </div>
      <Field
        label="Roasted kg"
        error={errors.kg}
        hint={green ? `Uses about ${green} kg of green coffee. Max ${capacity} kg on this roaster.` : `Max ${capacity} kg on this roaster.`}
      >
        <input type="number" inputMode="decimal" min={1} step={0.5} value={kg} onChange={(e) => (setKg(e.target.value), clear('kg'))} />
      </Field>
      <fieldset className="roast-pick">
        <legend>Roast level</legend>
        <div className="roast-options">
          {ROAST_NAMES.map((name, i) => (
            <label key={name} className={roastLevel === i + 1 ? 'roast-option is-active' : 'roast-option'}>
              <input type="radio" name="roast" checked={roastLevel === i + 1} onChange={() => setRoastLevel(i + 1)} />
              <span className={`swatch roast-${i + 1}`} aria-hidden="true" />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
    </FormDrawer>
  );
}
