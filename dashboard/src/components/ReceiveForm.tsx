import { useState } from 'react';
import { ApiError, fieldErrors, recordReceipt } from '../api';
import { GreenStock } from '../data';
import { Field, FormDrawer } from './FormDrawer';

/** Records a green coffee delivery. The API refuses deliveries that would overfill storage. */
export function ReceiveForm({
  stock,
  onClose,
  onSaved,
}: {
  stock: GreenStock;
  onClose: () => void;
  onSaved: (s: GreenStock) => void;
}) {
  const [kg, setKg] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Drop a field's error as soon as the user changes it. */
  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const space = Math.round((stock.capacity - stock.kg) * 10) / 10;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      onSaved(await recordReceipt(stock.coffeeId!, { kg: Number(kg), ...(supplierRef.trim() && { supplierRef: supplierRef.trim() }) }));
    } catch (e) {
      setBusy(false);
      const fe = fieldErrors(e);
      if (Object.keys(fe).length) return setErrors(fe);
      if (e instanceof ApiError && e.code === 'STORAGE_CAPACITY_EXCEEDED') return setErrors({ kg: e.message });
      setFormError(e instanceof ApiError ? e.message : 'Could not record the delivery');
    }
  };

  return (
    <FormDrawer
      title="Receive green coffee"
      subtitle={`${stock.coffee}: ${stock.kg} kg on hand, room for ${space} kg more.`}
      submitLabel="Record delivery"
      busy={busy}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Kg delivered" error={errors.kg} hint={`Storage holds up to ${stock.capacity} kg.`}>
        <input type="number" inputMode="decimal" min={1} step={1} value={kg} onChange={(e) => (setKg(e.target.value), clear('kg'))} />
      </Field>
      <Field label="Supplier reference (optional)" error={errors.supplierRef}>
        <input value={supplierRef} maxLength={40} onChange={(e) => (setSupplierRef(e.target.value), clear('supplierRef'))} placeholder="e.g. PO-1182" />
      </Field>
    </FormDrawer>
  );
}
