export type OrderStatus = 'New' | 'Roasting' | 'Packed' | 'Shipped';

export interface OrderLine {
  coffee: string;
  kg: number;
  grind: 'Whole bean' | 'Espresso' | 'Filter';
}

export interface Order {
  id: string;
  customer: string;
  city: string;
  lines: OrderLine[];
  due: string; // ISO date
  status: OrderStatus;
  total: number; // USD
  note?: string;
}

export interface Batch {
  id: string;
  coffee: string;
  start: number; // minutes from midnight
  duration: number; // minutes
  kg: number;
  roast: 1 | 2 | 3 | 4 | 5; // 1 = lightest
  roaster: 'Probat P12' | 'Loring S15';
}

export interface GreenStock {
  coffeeId?: string;
  coffee: string;
  origin: string;
  kg: number;
  reorderAt: number;
  capacity: number;
}

export type ShippedWeek = { week: string } & Record<(typeof ORIGINS)[number], number>;

/*
 * The app now loads its data from the Roastline API (see api.ts).
 * The sample arrays below are kept as a reference copy of the API's seed data.
 */

/** The demo is frozen at this moment so screenshots stay consistent. */
export const NOW = { date: '2026-11-05', minutes: 10 * 60 + 40 };

export const COFFEES = {
  guji: 'Ethiopia Guji Natural',
  huila: 'Colombia Huila Washed',
  nyeri: 'Kenya Nyeri AA',
  cerrado: 'Brazil Cerrado',
  huehue: 'Guatemala Huehuetenango',
  house: 'House Espresso Blend',
  decaf: 'Colombia Sugarcane Decaf',
} as const;

const C = COFFEES;

export const orders: Order[] = [
  { id: 'WH-2418', customer: 'Lantern Coffee Bar', city: 'Portland', due: '2026-11-05', status: 'Packed', total: 412, lines: [{ coffee: C.house, kg: 12, grind: 'Whole bean' }, { coffee: C.guji, kg: 3, grind: 'Filter' }] },
  { id: 'WH-2419', customer: 'Dovetail Bakery', city: 'Seattle', due: '2026-11-05', status: 'Roasting', total: 186, lines: [{ coffee: C.huila, kg: 6, grind: 'Espresso' }] },
  { id: 'WH-2420', customer: 'Northside Kitchen', city: 'Tacoma', due: '2026-11-05', status: 'Roasting', total: 298, lines: [{ coffee: C.house, kg: 8, grind: 'Espresso' }, { coffee: C.decaf, kg: 2, grind: 'Espresso' }], note: 'Deliver before 2 pm, back door.' },
  { id: 'WH-2421', customer: 'Fieldnote Café', city: 'Portland', due: '2026-11-06', status: 'New', total: 524, lines: [{ coffee: C.nyeri, kg: 5, grind: 'Filter' }, { coffee: C.house, kg: 10, grind: 'Whole bean' }] },
  { id: 'WH-2422', customer: 'Common Ground Co-op', city: 'Eugene', due: '2026-11-06', status: 'New', total: 340, lines: [{ coffee: C.cerrado, kg: 12, grind: 'Whole bean' }] },
  { id: 'WH-2423', customer: 'Harbor Light Hotel', city: 'Seattle', due: '2026-11-06', status: 'New', total: 760, lines: [{ coffee: C.house, kg: 20, grind: 'Whole bean' }, { coffee: C.decaf, kg: 4, grind: 'Filter' }], note: 'Monthly standing order.' },
  { id: 'WH-2424', customer: 'Little Owl Espresso', city: 'Olympia', due: '2026-11-07', status: 'New', total: 158, lines: [{ coffee: C.guji, kg: 4, grind: 'Espresso' }] },
  { id: 'WH-2410', customer: 'Bramble & Bean', city: 'Portland', due: '2026-11-04', status: 'Shipped', total: 245, lines: [{ coffee: C.huehue, kg: 7, grind: 'Whole bean' }] },
  { id: 'WH-2411', customer: 'Second Shift Diner', city: 'Salem', due: '2026-11-04', status: 'Shipped', total: 390, lines: [{ coffee: C.cerrado, kg: 14, grind: 'Filter' }] },
  { id: 'WH-2412', customer: 'Lantern Coffee Bar', city: 'Portland', due: '2026-11-03', status: 'Shipped', total: 412, lines: [{ coffee: C.house, kg: 12, grind: 'Whole bean' }, { coffee: C.guji, kg: 3, grind: 'Filter' }] },
  { id: 'WH-2413', customer: 'Moss Street Books', city: 'Tacoma', due: '2026-11-04', status: 'Shipped', total: 96, lines: [{ coffee: C.huila, kg: 3, grind: 'Filter' }] },
  { id: 'WH-2414', customer: 'Pine & Pour', city: 'Bend', due: '2026-11-05', status: 'Packed', total: 268, lines: [{ coffee: C.nyeri, kg: 3, grind: 'Whole bean' }, { coffee: C.huila, kg: 4, grind: 'Whole bean' }] },
  { id: 'WH-2415', customer: 'Riverbend Roast House', city: 'Eugene', due: '2026-11-05', status: 'Packed', total: 182, lines: [{ coffee: C.huehue, kg: 6, grind: 'Espresso' }] },
  { id: 'WH-2416', customer: 'The Daily Grind Truck', city: 'Salem', due: '2026-11-05', status: 'Roasting', total: 120, lines: [{ coffee: C.house, kg: 4, grind: 'Espresso' }] },
  { id: 'WH-2417', customer: 'Overlook Lodge', city: 'Hood River', due: '2026-11-06', status: 'New', total: 455, lines: [{ coffee: C.cerrado, kg: 10, grind: 'Whole bean' }, { coffee: C.decaf, kg: 3, grind: 'Whole bean' }] },
  { id: 'WH-2405', customer: 'Fieldnote Café', city: 'Portland', due: '2026-11-02', status: 'Shipped', total: 498, lines: [{ coffee: C.nyeri, kg: 5, grind: 'Filter' }, { coffee: C.house, kg: 9, grind: 'Whole bean' }] },
  { id: 'WH-2406', customer: 'Dovetail Bakery', city: 'Seattle', due: '2026-11-02', status: 'Shipped', total: 186, lines: [{ coffee: C.huila, kg: 6, grind: 'Espresso' }] },
  { id: 'WH-2407', customer: 'Harbor Light Hotel', city: 'Seattle', due: '2026-11-03', status: 'Shipped', total: 702, lines: [{ coffee: C.house, kg: 18, grind: 'Whole bean' }, { coffee: C.decaf, kg: 4, grind: 'Filter' }] },
  { id: 'WH-2408', customer: 'Common Ground Co-op', city: 'Eugene', due: '2026-11-03', status: 'Shipped', total: 310, lines: [{ coffee: C.cerrado, kg: 11, grind: 'Whole bean' }] },
  { id: 'WH-2409', customer: 'Little Owl Espresso', city: 'Olympia', due: '2026-11-03', status: 'Shipped', total: 158, lines: [{ coffee: C.guji, kg: 4, grind: 'Espresso' }] },
  { id: 'WH-2425', customer: 'Copperline Studio Café', city: 'Seattle', due: '2026-11-07', status: 'New', total: 214, lines: [{ coffee: C.huehue, kg: 5, grind: 'Filter' }, { coffee: C.guji, kg: 2, grind: 'Filter' }] },
  { id: 'WH-2426', customer: 'Bramble & Bean', city: 'Portland', due: '2026-11-08', status: 'New', total: 245, lines: [{ coffee: C.huehue, kg: 7, grind: 'Whole bean' }] },
];

export const batches: Batch[] = [
  { id: 'B-1', coffee: C.house, start: 6 * 60 + 15, duration: 55, kg: 12, roast: 4, roaster: 'Probat P12' },
  { id: 'B-2', coffee: C.huila, start: 7 * 60 + 20, duration: 45, kg: 10, roast: 3, roaster: 'Probat P12' },
  { id: 'B-3', coffee: C.guji, start: 6 * 60 + 40, duration: 40, kg: 7, roast: 1, roaster: 'Loring S15' },
  { id: 'B-4', coffee: C.decaf, start: 8 * 60 + 30, duration: 45, kg: 6, roast: 3, roaster: 'Loring S15' },
  { id: 'B-5', coffee: C.house, start: 8 * 60 + 25, duration: 55, kg: 12, roast: 4, roaster: 'Probat P12' },
  { id: 'B-6', coffee: C.huehue, start: 9 * 60 + 50, duration: 45, kg: 9, roast: 2, roaster: 'Loring S15' },
  { id: 'B-7', coffee: C.house, start: 10 * 60 + 15, duration: 55, kg: 12, roast: 4, roaster: 'Probat P12' },
  { id: 'B-8', coffee: C.nyeri, start: 11 * 60 + 20, duration: 40, kg: 8, roast: 1, roaster: 'Loring S15' },
  { id: 'B-9', coffee: C.cerrado, start: 12 * 60 + 30, duration: 50, kg: 12, roast: 3, roaster: 'Probat P12' },
  { id: 'B-10', coffee: C.cerrado, start: 13 * 60 + 40, duration: 50, kg: 12, roast: 3, roaster: 'Probat P12' },
  { id: 'B-11', coffee: C.guji, start: 13 * 60 + 10, duration: 40, kg: 7, roast: 1, roaster: 'Loring S15' },
  { id: 'B-12', coffee: C.house, start: 15 * 60, duration: 55, kg: 12, roast: 5, roaster: 'Probat P12' },
  { id: 'B-13', coffee: C.decaf, start: 14 * 60 + 30, duration: 45, kg: 6, roast: 3, roaster: 'Loring S15' },
];

export const greenStock: GreenStock[] = [
  { coffee: C.guji, origin: 'Ethiopia', kg: 48, reorderAt: 60, capacity: 300 },
  { coffee: C.huila, origin: 'Colombia', kg: 212, reorderAt: 80, capacity: 300 },
  { coffee: C.nyeri, origin: 'Kenya', kg: 36, reorderAt: 50, capacity: 200 },
  { coffee: C.cerrado, origin: 'Brazil', kg: 540, reorderAt: 150, capacity: 700 },
  { coffee: C.huehue, origin: 'Guatemala', kg: 164, reorderAt: 80, capacity: 300 },
  { coffee: C.decaf, origin: 'Colombia', kg: 92, reorderAt: 40, capacity: 150 },
];

/** Kilograms shipped per week, by origin, for the last 6 weeks. */
export const shippedByWeek: ShippedWeek[] = [
  { week: 'Oct 1', Brazil: 118, Colombia: 64, Ethiopia: 28, Guatemala: 30, Kenya: 14 },
  { week: 'Oct 8', Brazil: 126, Colombia: 70, Ethiopia: 31, Guatemala: 26, Kenya: 18 },
  { week: 'Oct 15', Brazil: 122, Colombia: 66, Ethiopia: 36, Guatemala: 34, Kenya: 16 },
  { week: 'Oct 22', Brazil: 140, Colombia: 72, Ethiopia: 34, Guatemala: 32, Kenya: 20 },
  { week: 'Oct 29', Brazil: 151, Colombia: 78, Ethiopia: 40, Guatemala: 35, Kenya: 22 },
  { week: 'Nov 5', Brazil: 96, Colombia: 51, Ethiopia: 22, Guatemala: 20, Kenya: 13 },
];

export const ORIGINS = ['Brazil', 'Colombia', 'Ethiopia', 'Guatemala', 'Kenya'] as const;

export const orderKg = (o: Order) => o.lines.reduce((s, l) => s + l.kg, 0);
