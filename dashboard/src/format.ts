import { NOW } from './data';

export const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const dayDiff = (iso: string) => {
  const a = new Date(`${iso}T00:00:00`);
  const b = new Date(`${NOW.date}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
};

export const dueLabel = (iso: string) => {
  const d = dayDiff(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const isDueToday = (iso: string) => dayDiff(iso) === 0;

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
