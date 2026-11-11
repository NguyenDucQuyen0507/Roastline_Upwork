import type { Batch, Coffee, Order, StockRecord, User } from './domain.js';
import { greenNeeded } from './domain.js';
import { hashPassword } from './auth.js';

export const coffees: Coffee[] = [
  { id: 'guji', name: 'Ethiopia Guji Natural', origin: 'Ethiopia', pricePerKg: 34, isBlend: false },
  { id: 'huila', name: 'Colombia Huila Washed', origin: 'Colombia', pricePerKg: 31, isBlend: false },
  { id: 'nyeri', name: 'Kenya Nyeri AA', origin: 'Kenya', pricePerKg: 38, isBlend: false },
  { id: 'cerrado', name: 'Brazil Cerrado', origin: 'Brazil', pricePerKg: 28, isBlend: false },
  { id: 'huehue', name: 'Guatemala Huehuetenango', origin: 'Guatemala', pricePerKg: 35, isBlend: false },
  { id: 'house', name: 'House Espresso Blend', origin: 'Brazil / Colombia', pricePerKg: 26, isBlend: true },
  { id: 'decaf', name: 'Colombia Sugarcane Decaf', origin: 'Colombia', pricePerKg: 32, isBlend: false },
];

type SeedOrder = Omit<Order, 'lines'> & { lines: [Order['lines'][number]['coffeeId'], number, Order['lines'][number]['grind']][] };

const rawOrders: SeedOrder[] = [
  { id: 'WH-2418', customer: 'Lantern Coffee Bar', city: 'Portland', due: '2026-11-05', status: 'Packed', lines: [['house', 12, 'Whole bean'], ['guji', 3, 'Filter']] },
  { id: 'WH-2419', customer: 'Dovetail Bakery', city: 'Seattle', due: '2026-11-05', status: 'Roasting', lines: [['huila', 6, 'Espresso']] },
  { id: 'WH-2420', customer: 'Northside Kitchen', city: 'Tacoma', due: '2026-11-05', status: 'Roasting', lines: [['house', 8, 'Espresso'], ['decaf', 2, 'Espresso']], note: 'Deliver before 2 pm, back door.' },
  { id: 'WH-2421', customer: 'Fieldnote Café', city: 'Portland', due: '2026-11-06', status: 'New', lines: [['nyeri', 5, 'Filter'], ['house', 10, 'Whole bean']] },
  { id: 'WH-2422', customer: 'Common Ground Co-op', city: 'Eugene', due: '2026-11-06', status: 'New', lines: [['cerrado', 12, 'Whole bean']] },
  { id: 'WH-2423', customer: 'Harbor Light Hotel', city: 'Seattle', due: '2026-11-06', status: 'New', lines: [['house', 20, 'Whole bean'], ['decaf', 4, 'Filter']], note: 'Monthly standing order.' },
  { id: 'WH-2424', customer: 'Little Owl Espresso', city: 'Olympia', due: '2026-11-07', status: 'New', lines: [['guji', 4, 'Espresso']] },
  { id: 'WH-2410', customer: 'Bramble & Bean', city: 'Portland', due: '2026-11-04', status: 'Shipped', lines: [['huehue', 7, 'Whole bean']] },
  { id: 'WH-2411', customer: 'Second Shift Diner', city: 'Salem', due: '2026-11-04', status: 'Shipped', lines: [['cerrado', 14, 'Filter']] },
  { id: 'WH-2412', customer: 'Lantern Coffee Bar', city: 'Portland', due: '2026-11-03', status: 'Shipped', lines: [['house', 12, 'Whole bean'], ['guji', 3, 'Filter']] },
  { id: 'WH-2413', customer: 'Moss Street Books', city: 'Tacoma', due: '2026-11-04', status: 'Shipped', lines: [['huila', 3, 'Filter']] },
  { id: 'WH-2414', customer: 'Pine & Pour', city: 'Bend', due: '2026-11-05', status: 'Packed', lines: [['nyeri', 3, 'Whole bean'], ['huila', 4, 'Whole bean']] },
  { id: 'WH-2415', customer: 'Riverbend Roast House', city: 'Eugene', due: '2026-11-05', status: 'Packed', lines: [['huehue', 6, 'Espresso']] },
  { id: 'WH-2416', customer: 'The Daily Grind Truck', city: 'Salem', due: '2026-11-05', status: 'Roasting', lines: [['house', 4, 'Espresso']] },
  { id: 'WH-2417', customer: 'Overlook Lodge', city: 'Hood River', due: '2026-11-06', status: 'New', lines: [['cerrado', 10, 'Whole bean'], ['decaf', 3, 'Whole bean']] },
  { id: 'WH-2405', customer: 'Fieldnote Café', city: 'Portland', due: '2026-11-02', status: 'Shipped', lines: [['nyeri', 5, 'Filter'], ['house', 9, 'Whole bean']] },
  { id: 'WH-2406', customer: 'Dovetail Bakery', city: 'Seattle', due: '2026-11-02', status: 'Shipped', lines: [['huila', 6, 'Espresso']] },
  { id: 'WH-2407', customer: 'Harbor Light Hotel', city: 'Seattle', due: '2026-11-03', status: 'Shipped', lines: [['house', 18, 'Whole bean'], ['decaf', 4, 'Filter']] },
  { id: 'WH-2408', customer: 'Common Ground Co-op', city: 'Eugene', due: '2026-11-03', status: 'Shipped', lines: [['cerrado', 11, 'Whole bean']] },
  { id: 'WH-2409', customer: 'Little Owl Espresso', city: 'Olympia', due: '2026-11-03', status: 'Shipped', lines: [['guji', 4, 'Espresso']] },
  { id: 'WH-2425', customer: 'Copperline Studio Café', city: 'Seattle', due: '2026-11-07', status: 'New', lines: [['huehue', 5, 'Filter'], ['guji', 2, 'Filter']] },
  { id: 'WH-2426', customer: 'Bramble & Bean', city: 'Portland', due: '2026-11-08', status: 'New', lines: [['huehue', 7, 'Whole bean']] },
];

export const seedOrders = (): Order[] =>
  rawOrders.map((o) => ({
    ...o,
    lines: o.lines.map(([coffeeId, kg, grind]) => ({ coffeeId, kg, grind })),
  }));

const rawBatches: Omit<Batch, 'greenUse'>[] = [
  { id: 'B-1', coffeeId: 'house', startMin: 6 * 60 + 15, durationMin: 55, kg: 12, roastLevel: 4, roaster: 'Probat P12' },
  { id: 'B-2', coffeeId: 'huila', startMin: 7 * 60 + 20, durationMin: 45, kg: 10, roastLevel: 3, roaster: 'Probat P12' },
  { id: 'B-3', coffeeId: 'guji', startMin: 6 * 60 + 40, durationMin: 40, kg: 7, roastLevel: 1, roaster: 'Loring S15' },
  { id: 'B-4', coffeeId: 'decaf', startMin: 8 * 60 + 30, durationMin: 45, kg: 6, roastLevel: 3, roaster: 'Loring S15' },
  { id: 'B-5', coffeeId: 'house', startMin: 8 * 60 + 25, durationMin: 55, kg: 12, roastLevel: 4, roaster: 'Probat P12' },
  { id: 'B-6', coffeeId: 'huehue', startMin: 9 * 60 + 50, durationMin: 45, kg: 9, roastLevel: 2, roaster: 'Loring S15' },
  { id: 'B-7', coffeeId: 'house', startMin: 10 * 60 + 15, durationMin: 55, kg: 12, roastLevel: 4, roaster: 'Probat P12' },
  { id: 'B-8', coffeeId: 'nyeri', startMin: 11 * 60 + 20, durationMin: 40, kg: 8, roastLevel: 1, roaster: 'Loring S15' },
  { id: 'B-9', coffeeId: 'cerrado', startMin: 12 * 60 + 30, durationMin: 50, kg: 12, roastLevel: 3, roaster: 'Probat P12' },
  { id: 'B-10', coffeeId: 'cerrado', startMin: 13 * 60 + 40, durationMin: 50, kg: 12, roastLevel: 3, roaster: 'Probat P12' },
  { id: 'B-11', coffeeId: 'guji', startMin: 13 * 60 + 10, durationMin: 40, kg: 7, roastLevel: 1, roaster: 'Loring S15' },
  { id: 'B-12', coffeeId: 'house', startMin: 15 * 60, durationMin: 55, kg: 12, roastLevel: 5, roaster: 'Probat P12' },
  { id: 'B-13', coffeeId: 'decaf', startMin: 14 * 60 + 30, durationMin: 45, kg: 6, roastLevel: 3, roaster: 'Loring S15' },
];

export const seedBatches = (): Batch[] =>
  rawBatches.map((b) => ({ ...b, greenUse: greenNeeded(b.coffeeId, b.kg) }));

/** Stock after today's scheduled batches have been taken out. */
export const seedStock = (): StockRecord[] => [
  { coffeeId: 'guji', kg: 48, reorderAt: 60, capacity: 300 },
  { coffeeId: 'huila', kg: 212, reorderAt: 80, capacity: 300 },
  { coffeeId: 'nyeri', kg: 36, reorderAt: 50, capacity: 200 },
  { coffeeId: 'cerrado', kg: 540, reorderAt: 150, capacity: 700 },
  { coffeeId: 'huehue', kg: 164, reorderAt: 80, capacity: 300 },
  { coffeeId: 'decaf', kg: 92, reorderAt: 40, capacity: 150 },
];

export const shippedByWeek = [
  { week: 'Oct 1', Brazil: 118, Colombia: 64, Ethiopia: 28, Guatemala: 30, Kenya: 14 },
  { week: 'Oct 8', Brazil: 126, Colombia: 70, Ethiopia: 31, Guatemala: 26, Kenya: 18 },
  { week: 'Oct 15', Brazil: 122, Colombia: 66, Ethiopia: 36, Guatemala: 34, Kenya: 16 },
  { week: 'Oct 22', Brazil: 140, Colombia: 72, Ethiopia: 34, Guatemala: 32, Kenya: 20 },
  { week: 'Oct 29', Brazil: 151, Colombia: 78, Ethiopia: 40, Guatemala: 35, Kenya: 22 },
  { week: 'Nov 5', Brazil: 96, Colombia: 51, Ethiopia: 22, Guatemala: 20, Kenya: 13 },
];

/** Public demo accounts, shown on the dashboard's sign-in screen and in the API docs. */
export const DEMO_PASSWORD = 'roastline-demo';
export const demoUsers: Omit<User, 'passwordHash'>[] = [
  { id: 'u-1', email: 'admin@roastline.dev', name: 'Sam Rivera', role: 'admin' },
  { id: 'u-2', email: 'production@roastline.dev', name: 'Mara Okafor', role: 'production' },
  { id: 'u-3', email: 'viewer@roastline.dev', name: 'Jo Chen', role: 'viewer' },
];

// Hashing is deliberately slow, so hash the demo password once per process.
let hashed: Promise<string[]> | undefined;
export async function seedUsers(): Promise<User[]> {
  hashed ??= Promise.all(demoUsers.map(() => hashPassword(DEMO_PASSWORD)));
  const hashes = await hashed;
  return demoUsers.map((u, i) => ({ ...u, passwordHash: hashes[i] }));
}
