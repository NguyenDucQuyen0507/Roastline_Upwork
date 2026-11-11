import { useMemo, useState } from 'react';
import { ApiError, createOrder, fieldErrors, type Coffee, type NewOrder } from '../api';
import { NOW, Order } from '../data';
import { usd } from '../format';
import { Field, FormDrawer } from './FormDrawer';

const GRINDS = ['Whole bean', 'Espresso', 'Filter'] as const;
type Line = { coffeeId: string; kg: string; grind: (typeof GRINDS)[number] };

export function NewOrderForm({
  coffees,
  orders,
  onClose,
  onCreated,
}: {
  coffees: Coffee[];
  orders: Order[];
  onClose: () => void;
  onCreated: (o: Order) => void;
}) {
  const [customer, setCustomer] = useState('');
  const [city, setCity] = useState('');
  const [due, setDue] = useState(NOW.date);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([{ coffeeId: coffees[0]?.id ?? '', kg: '', grind: 'Whole bean' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Drop a field's error as soon as the user changes it. */
  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Existing customers, so picking one fills in the city.
  const known = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) if (!m.has(o.customer)) m.set(o.customer, o.city);
    return m;
  }, [orders]);

  const price = (id: string) => coffees.find((c) => c.id === id)?.pricePerKg ?? 0;
  const estimate = lines.reduce((s, l) => s + (Number(l.kg) || 0) * price(l.coffeeId), 0);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    const body: NewOrder = {
      customer: customer.trim(),
      city: city.trim(),
      due,
      ...(note.trim() && { note: note.trim() }),
      lines: lines.map((l) => ({ coffeeId: l.coffeeId, kg: Number(l.kg), grind: l.grind })),
    };
    try {
      onCreated(await createOrder(body));
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError(e instanceof ApiError ? e.message : 'Could not create the order');
      else if (fe.lines) setFormError(fe.lines);
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      title="New wholesale order"
      subtitle="Prices come from the coffee catalog; the server calculates the total."
      submitLabel="Create order"
      busy={busy}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Customer" error={errors.customer}>
        <input
          list="known-customers"
          value={customer}
          onChange={(e) => {
            setCustomer(e.target.value);
            clear('customer');
            const c = known.get(e.target.value);
            if (c) {
              setCity(c);
              clear('city');
            }
          }}
          autoComplete="off"
        />
        <datalist id="known-customers">
          {[...known.keys()].sort().map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="field-row">
        <Field label="City" error={errors.city}>
          <input value={city} onChange={(e) => (setCity(e.target.value), clear('city'))} />
        </Field>
        <Field label="Due date" error={errors.due}>
          <input type="date" min={NOW.date} value={due} onChange={(e) => (setDue(e.target.value), clear('due'))} />
        </Field>
      </div>

      <fieldset className="lines-edit">
        <legend>Order lines</legend>
        {lines.map((l, i) => (
          <div key={i} className="line-edit">
            <Field label="Coffee" error={errors[`lines.${i}.coffeeId`]} className="grow">
              <select value={l.coffeeId} onChange={(e) => (setLine(i, { coffeeId: e.target.value }), clear(`lines.${i}.coffeeId`))}>
                {coffees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({usd(c.pricePerKg)}/kg)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kg" error={errors[`lines.${i}.kg`]} className="narrow">
              <input type="number" inputMode="decimal" min={0.5} step={0.5} value={l.kg} onChange={(e) => (setLine(i, { kg: e.target.value }), clear(`lines.${i}.kg`))} />
            </Field>
            <Field label="Grind" error={errors[`lines.${i}.grind`]}>
              <select value={l.grind} onChange={(e) => setLine(i, { grind: e.target.value as Line['grind'] })}>
                {GRINDS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            {lines.length > 1 && (
              <button
                type="button"
                className="icon-btn line-remove"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => {
                  setLines((ls) => ls.filter((_, j) => j !== i));
                  setErrors({});
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {lines.length < 10 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setLines((ls) => [...ls, { coffeeId: coffees[0]?.id ?? '', kg: '', grind: 'Whole bean' }])}
          >
            + Add coffee
          </button>
        )}
      </fieldset>

      <Field label="Delivery note (optional)" error={errors.note}>
        <textarea rows={2} maxLength={280} value={note} onChange={(e) => (setNote(e.target.value), clear('note'))} />
      </Field>

      <p className="estimate">
        Estimated total <strong>{usd(estimate)}</strong>
      </p>
    </FormDrawer>
  );
}
