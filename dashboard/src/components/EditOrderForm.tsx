import { useState } from 'react';
import { ApiError, fieldErrors, updateOrder } from '../api';
import { NOW, Order } from '../data';
import { Field, FormDrawer } from './FormDrawer';

/** Edit the due date and delivery note of a New order (the API locks orders once roasting starts). */
export function EditOrderForm({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: (o: Order) => void;
}) {
  const [due, setDue] = useState(order.due);
  const [note, setNote] = useState(order.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Drop a field's error as soon as the user changes it. */
  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      onSaved(await updateOrder(order.id, { due, note: note.trim() }));
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      if (!Object.keys(fe).length) setFormError(e instanceof ApiError ? e.message : 'Could not save the order');
      setBusy(false);
    }
  };

  return (
    <FormDrawer
      title={`Edit ${order.id}`}
      subtitle={order.customer}
      submitLabel="Save changes"
      busy={busy}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Due date" error={errors.due}>
        <input type="date" min={NOW.date} value={due} onChange={(e) => (setDue(e.target.value), clear('due'))} />
      </Field>
      <Field label="Delivery note" error={errors.note}>
        <textarea rows={3} maxLength={280} value={note} onChange={(e) => (setNote(e.target.value), clear('note'))} />
      </Field>
    </FormDrawer>
  );
}
